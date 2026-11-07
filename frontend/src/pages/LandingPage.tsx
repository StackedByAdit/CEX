import { useEffect } from "react";
import { isAuthenticated } from "../lib/auth";
import ArchitectureSection from "../components/landing/ArchitectureSection";
import ClosingSection from "../components/landing/ClosingSection";
import FeaturesSection from "../components/landing/FeaturesSection";
import HeroSection from "../components/landing/HeroSection";
import LandingFooter from "../components/landing/LandingFooter";
import LandingNav from "../components/landing/LandingNav";
import OrbitField from "../components/landing/OrbitField";
import PerformanceSection from "../components/landing/PerformanceSection";
import SimulatorSection from "../components/landing/SimulatorSection";

export default function LandingPage() {
  const authed = isAuthenticated();

  useEffect(() => {
    document.documentElement.classList.add("orbit-public");
    return () => {
      document.documentElement.classList.remove("orbit-public");
    };
  }, []);

  return (
    <div className="bg-orbit-bg text-white">
      <OrbitField />
      <div className="relative z-10">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
      >
        Skip to content
      </a>
      <LandingNav authed={authed} />
      <main id="main">
        <HeroSection authed={authed} />
        <FeaturesSection />
        <ArchitectureSection />
        <PerformanceSection />
        <SimulatorSection />
        <ClosingSection authed={authed} />
      </main>
      <LandingFooter authed={authed} />
      </div>
    </div>
  );
}
