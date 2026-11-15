import type { Metadata } from "next";
import "./globals.css";
import "ol/ol.css";
export const metadata: Metadata = {
  title: "ӨРТӨӨ | URTUU — Martian Map Mission Control",
  description:
    "From the Mongolian Steppe to Mars. Open planetary expedition planning and explicitly labeled simulations.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
