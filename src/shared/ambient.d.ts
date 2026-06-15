// Ambient declarations for optional/untyped runtime dependencies.

// geoip-lite ships no TypeScript types.
declare module "geoip-lite" {
  interface GeoLookup {
    country?: string;
    region?: string;
    city?: string;
    ll?: [number, number];
    [key: string]: unknown;
  }
  export function lookup(ip: string): GeoLookup | null;
  const geoip: { lookup(ip: string): GeoLookup | null };
  export default geoip;
}
