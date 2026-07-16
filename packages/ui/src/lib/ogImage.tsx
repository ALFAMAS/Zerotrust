import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

// Shared layout for every route's `opengraph-image.tsx`. `next/og`'s
// ImageResponse renders via Satori, which only understands inline flexbox
// styles (no Tailwind, no external stylesheets) — so this stays plain CSS-in-JS.
export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";

interface OgCardProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function renderOgImage({ eyebrow, title, description }: OgCardProps) {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        backgroundColor: "#0b0b16",
        backgroundImage:
          "radial-gradient(circle at 18% 22%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(circle at 82% 78%, rgba(99,102,241,0.18), transparent 50%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            backgroundColor: brand.color,
            color: "#ffffff",
            fontSize: "28px",
            fontWeight: 700,
          }}
        >
          {brand.logoLetter}
        </div>
        <div style={{ display: "flex", fontSize: "28px", fontWeight: 600, color: "#ffffff" }}>
          {brand.name}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "980px" }}>
        <div
          style={{
            display: "flex",
            fontSize: "22px",
            fontWeight: 600,
            color: "#a5b4fc",
            textTransform: "uppercase",
            letterSpacing: "2px",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "64px",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", fontSize: "26px", color: "#c7c9e0", lineHeight: 1.4 }}>
          {description}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: "20px", color: "#8385a8" }}>
        {brand.url.replace(/^https?:\/\//, "")}
      </div>
    </div>,
    { ...ogImageSize }
  );
}
