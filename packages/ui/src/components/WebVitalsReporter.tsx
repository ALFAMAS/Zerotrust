"use client";

import { useReportWebVitals } from "next/web-vitals";
import { reportWebVital } from "@/lib/webVitals";

export default function WebVitalsReporter() {
  useReportWebVitals(reportWebVital);
  return null;
}
