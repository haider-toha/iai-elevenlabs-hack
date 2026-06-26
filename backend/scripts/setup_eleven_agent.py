"""Idempotent ElevenLabs bootstrap: reconciles the live workspace with intent.

Standalone ops CLI — run manually:
    poetry run python backend/scripts/setup_eleven_agent.py

Safe to re-run any number of times. It uploads/updates the GOV.UK KB docs
(content-hash-versioned), creates-or-updates the "Letter Explainer" agent, and
rewrites NEXT_PUBLIC_AGENT_ID into frontend/.env.

This is NOT part of the FastAPI request path, so reading os.environ here
directly is intentional — the "no os.environ outside config.py" rule governs
the app, not a one-off bootstrap tool.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv
from elevenlabs import ElevenLabs

AGENT_NAME = "Letter Explainer"
PRONUNCIATION_DICT_NAME = "Letter Explainer Pronunciation"
SWITCH_LANGUAGE_TOOL_NAME = "switch_language"
REPO_ROOT = Path(__file__).resolve().parents[2]
GOVUK_DIR = REPO_ROOT / "backend" / "data" / "govuk"
SYSTEM_PROMPT = (REPO_ROOT / "backend" / "prompts" / "letter_explainer.txt").read_text()
ENV_PATH = REPO_ROOT / "frontend" / ".env"

EMBEDDING_MODEL = "e5_mistral_7b_instruct"

# Scribe STT bias list (plan §"Agent configuration", <=50 terms).
STT_KEYTERMS: list[str] = [
    "HMRC",
    "PAYE",
    "tax code",
    "coding notice",
    "Personal Allowance",
    "company car benefit",
    "P2",
    "P800",
    "National Insurance",
    "tax-free amount",
    "Simple Assessment",
    "K code",
    "tax year",
]

# Pronunciation dictionary entries (plan §"Agent configuration"). Alias rules so
# the TTS voice reads the jargon naturally instead of spelling it badly.
PRONUNCIATION_RULES: list[dict[str, str]] = [
    {"type": "alias", "string_to_replace": "PAYE", "alias": "pay as you earn"},
    {"type": "alias", "string_to_replace": "HMRC", "alias": "H-M-R-C"},
    {"type": "alias", "string_to_replace": "P800", "alias": "P eight hundred"},
    {"type": "alias", "string_to_replace": "883L", "alias": "eight eight three, L"},
    {"type": "alias", "string_to_replace": "1257L", "alias": "one two five seven, L"},
]

# The `switch_language` client tool. The agent calls it when the user asks to
# continue in another language; the page (`convai-leaf.tsx`) handles it via
# onUnhandledClientToolCall and restarts the session in the Welsh voice.
# Shape per the ElevenLabs create-tool API (ToolRequestModel.tool_config, client
# discriminator) — `parameters` is JSON-Schema object style, NOT the dashboard's
# array style. Inline `prompt.tools` was removed by ElevenLabs on 2025-07-23, so
# the tool is created standalone and referenced from the agent via `tool_ids`.
# https://elevenlabs.io/docs/api-reference/tools/create
SWITCH_LANGUAGE_TOOL_CONFIG: dict[str, object] = {
    "type": "client",
    "name": SWITCH_LANGUAGE_TOOL_NAME,
    "description": (
        "Call this when the user asks to continue in another language, or "
        "speaks another language. Pass the target language code (e.g. 'cy' for "
        "Welsh). Do not answer the question first — call the tool, then continue "
        "in that language."
    ),
    "expects_response": False,
    "parameters": {
        "type": "object",
        "properties": {
            "target": {
                "type": "string",
                "description": (
                    "BCP-47 language code to switch to, e.g. 'cy' for Welsh."
                ),
            },
        },
        "required": ["target"],
    },
}


class KbDoc(TypedDict):
    type: str
    name: str
    id: str


class DictLocator(TypedDict):
    pronunciation_dictionary_id: str
    version_id: str


# Read XI_API_KEY / XI_VOICE_ID_ENGLISH from backend/.env (not just the ambient
# shell) so this ops script follows the same ".env is the source" rule as the app.
# An already-exported shell var still wins (load_dotenv override defaults to False).
load_dotenv(REPO_ROOT / "backend" / ".env")

client = ElevenLabs(api_key=os.environ["XI_API_KEY"])


def reconcile_kb_doc(md: Path) -> KbDoc:
    """Upload md if missing, re-upload if content changed, otherwise reuse."""
    name = md.stem.replace("-", " ").title()
    content_hash = hashlib.sha256(md.read_bytes()).hexdigest()[:8]
    versioned_name = f"{name} [{content_hash}]"

    existing = client.conversational_ai.knowledge_base.list(search=name).documents
    for d in existing:
        if d.name == versioned_name:
            return {"type": "file", "name": d.name, "id": d.id}
        # Stale version with the same base name — delete before re-uploading.
        if d.name.startswith(f"{name} ["):
            client.conversational_ai.knowledge_base.documents.delete(
                documentation_id=d.id
            )

    with md.open("rb") as f:
        doc = client.conversational_ai.knowledge_base.documents.create_from_file(
            file=f,
            name=versioned_name,
        )
    client.conversational_ai.knowledge_base.document.compute_rag_index(
        documentation_id=doc.id,
        model=EMBEDDING_MODEL,
    )
    return {"type": "file", "name": doc.name, "id": doc.id}


def reconcile_pronunciation_dict() -> DictLocator:
    """Create-or-reuse the pronunciation dictionary; return its locator."""
    existing = client.pronunciation_dictionaries.list().pronunciation_dictionaries
    for pd in existing:
        if pd.name == PRONUNCIATION_DICT_NAME:
            return {
                "pronunciation_dictionary_id": pd.id,
                "version_id": pd.latest_version_id,
            }
    created = client.pronunciation_dictionaries.create_from_rules(
        name=PRONUNCIATION_DICT_NAME,
        rules=PRONUNCIATION_RULES,
    )
    return {
        "pronunciation_dictionary_id": created.id,
        "version_id": created.version_id,
    }


def reconcile_client_tool() -> str:
    """Create-or-reuse the switch_language client tool; return its id.

    The tool record is referenced from the agent via prompt.tool_ids — inline
    prompt.tools is no longer accepted by the API.
    """
    existing = client.conversational_ai.tools.list().tools
    for tool in existing:
        if tool.tool_config.name == SWITCH_LANGUAGE_TOOL_NAME:
            return str(tool.id)
    created = client.conversational_ai.tools.create(
        request={"tool_config": SWITCH_LANGUAGE_TOOL_CONFIG}
    )
    return str(created.id)


def desired_config(
    kb_docs: list[KbDoc], dict_locator: DictLocator, switch_language_tool_id: str
) -> tuple[dict[str, object], dict[str, object]]:
    conversation_config: dict[str, object] = {
        "agent": {
            "prompt": {
                "prompt": SYSTEM_PROMPT,
                "llm": "claude-sonnet-4-5",
                "knowledge_base": kb_docs,
                "rag": {
                    "enabled": True,
                    "embedding_model": EMBEDDING_MODEL,
                },
                # source_attribution -> answers report used_static_kb_document_ids
                # for the on-screen GOV.UK citation chips.
                "source_attribution": True,
                # The switch_language client tool the agent calls for the Welsh
                # beat. Referenced by id — inline prompt.tools is rejected since
                # 2025-07-23.
                "tool_ids": [switch_language_tool_id],
            },
            "first_message": "Hi, I'm Marginalia. What would you like to know about your letter?",
            "language": "en",
        },
        "tts": {
            "voice_id": os.environ["XI_VOICE_ID_ENGLISH"],
            # v3 Conversational is the one real-time ConvAI model that supports
            # Welsh (cy), so a single agent serves both the English session and the
            # live Welsh switch. flash/turbo v2 and v2.5 reject "cy"; plain
            # eleven_v3 is expressive TTS only (not allowed for agents). Trade-off:
            # slightly higher latency than flash v2 — accepted for bilingual voice.
            "model_id": "eleven_v3_conversational",
            "pronunciation_dictionary_locators": [dict_locator],
        },
        "asr": {"keywords": STT_KEYTERMS},
        # Welsh registered as a switchable language — valid now the model is
        # v3_conversational. The language beat (convai-leaf restartInLanguage)
        # overrides language -> "cy" / "en" and the matching voice at session
        # start, carrying the prior transcript into the new session's prompt.
        "language_presets": {
            "cy": {
                "overrides": {
                    "tts": {"voice_id": os.environ["XI_VOICE_ID_WELSH"]},
                },
            },
        },
    }
    platform_settings: dict[str, object] = {
        "overrides": {
            "conversation_config_override": {
                "agent": {
                    "prompt": {"prompt": True},
                    "first_message": True,
                    "language": True,
                },
                "tts": {"voice_id": True},
            },
        },
        "auth": {"enable_auth": True},
        # Conversation-history redaction is enterprise-only on ElevenLabs, and this
        # workspace is non-enterprise (the API 403s when enabled). The demo letters
        # carry only fabricated PII (e.g. "Maria Davies", test NI QQ123456C), so it
        # stays off here. To enable on an enterprise plan, set:
        #   {"enabled": True, "entities": ["name", "unique_id.government_issued_id"]}
        "privacy": {"conversation_history_redaction": {"enabled": False}},
    }
    return conversation_config, platform_settings


def find_agent_id(name: str) -> str | None:
    page = client.conversational_ai.agents.list(search=name)
    for a in page.agents:
        if a.name == name:
            return str(a.agent_id)
    return None


def write_env(agent_id: str) -> None:
    lines = [
        line
        for line in ENV_PATH.read_text().splitlines()
        if not line.startswith("NEXT_PUBLIC_AGENT_ID=")
    ]
    lines.append(f"NEXT_PUBLIC_AGENT_ID={agent_id}")
    ENV_PATH.write_text("\n".join(lines) + "\n")


def main() -> None:
    kb_docs = [reconcile_kb_doc(md) for md in sorted(GOVUK_DIR.glob("*.md"))]
    dict_locator = reconcile_pronunciation_dict()
    switch_language_tool_id = reconcile_client_tool()
    conversation_config, platform_settings = desired_config(
        kb_docs, dict_locator, switch_language_tool_id
    )

    agent_id = find_agent_id(AGENT_NAME)
    if agent_id:
        client.conversational_ai.agents.update(
            agent_id=agent_id,
            name=AGENT_NAME,
            conversation_config=conversation_config,
            platform_settings=platform_settings,
        )
        print(f"Agent updated: {agent_id}")
    else:
        agent = client.conversational_ai.agents.create(
            name=AGENT_NAME,
            conversation_config=conversation_config,
            platform_settings=platform_settings,
        )
        agent_id = str(agent.agent_id)
        print(f"Agent created: {agent_id}")

    write_env(agent_id)
    print(f"Wrote NEXT_PUBLIC_AGENT_ID to {ENV_PATH}")


if __name__ == "__main__":
    main()
