import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const runtime = "edge";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #5b21b6 0%, #4f46e5 45%, #6366f1 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 28,
              color: "rgba(255,255,255,0.92)",
              fontWeight: 600,
            }}
          >
            {SITE_TAGLINE}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
