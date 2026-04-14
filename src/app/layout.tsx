import type { Metadata } from "next";
import localFont from "next/font/local";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import NativeAndroidUpdateGate from "@/components/NativeAndroidUpdateGate";
import NativePushBootstrap from "@/components/NativePushBootstrap";
import SharePromptOverlay from "@/components/SharePromptOverlay";
import TrackPageView from "@/components/TrackPageView";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  preload: false,
});


export const metadata: Metadata = {
  title: "LUNA",
  description: "LUNA onboarding",
  icons: {
    icon: "/luna/assets/costar/bg/costar_icon.png",
    apple: "/luna/assets/costar/bg/costar_icon.png",
    shortcut: "/luna/assets/costar/bg/costar_icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${ibmPlexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TrackPageView />
        <NativeAndroidUpdateGate />
        <NativePushBootstrap />
        {children}
        <SharePromptOverlay />
      </body>
    </html>
  );
}
