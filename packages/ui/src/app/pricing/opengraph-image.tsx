import { brand } from "@/config/brand";
import { ogImageContentType, ogImageSize, renderOgImage } from "@/lib/ogImage";

export const alt = `Pricing — ${brand.name}`;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage({
    eyebrow: "Pricing",
    title: "Predictable plans that scale with your product",
    description: "Free, Pro, and Enterprise — every plan includes the full auth platform.",
  });
}
