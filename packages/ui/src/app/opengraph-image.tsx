import { brand } from "@/config/brand";
import { ogImageContentType, ogImageSize, renderOgImage } from "@/lib/ogImage";

export const alt = `${brand.name} — ${brand.tagline}`;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage({
    eyebrow: "Self-hosted · open source",
    title: "Ship secure auth. Keep control.",
    description: brand.heroDescription,
  });
}
