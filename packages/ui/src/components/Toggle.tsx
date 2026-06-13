"use client";

import { Switch } from "@/components/ui/switch";

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

/** Backwards-compatible toggle — wraps the shadcn Switch primitive. */
export default function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />;
}
