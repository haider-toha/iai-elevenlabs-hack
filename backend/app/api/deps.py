from typing import Annotated

from fastapi import Depends

from app.config import Settings, get_settings

# Reusable dependency aliases. Inject these, never read env or construct
# Settings ad hoc. Add DbPoolDep etc. here as the app grows.
SettingsDep = Annotated[Settings, Depends(get_settings)]
