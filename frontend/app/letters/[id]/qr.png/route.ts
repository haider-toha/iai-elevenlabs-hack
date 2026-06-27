import QRCode from "qrcode";

// Same-origin replacement for the former FastAPI GET /letters/{id}/qr.png. The
// QR encodes the deployed-origin /l/{id} URL a phone scans. qrcode needs
// Buffer/zlib, so pin the Node runtime rather than rely on edge inference.
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const target = `${proto}://${host}/l/${id}`;

  const png = await QRCode.toBuffer(target, {
    errorCorrectionLevel: "Q",
    margin: 4,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    },
  });
}
