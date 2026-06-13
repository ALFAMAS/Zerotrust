import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl font-bold text-foreground"
            style={{ backgroundColor: brand.logoColor }}
          >
            {brand.logoLetter}
          </div>
          <span className="text-xl font-bold text-foreground">{brand.name}</span>
        </div>
        <main
          id="main-content"
          className="rounded-2xl border border-border bg-card p-8 text-card-foreground shadow"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
