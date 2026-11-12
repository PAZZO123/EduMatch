import React, { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Cpu,
  GraduationCap,
  School,
  Check,
  FileCheck2,
  ClipboardList,
} from "lucide-react";
import logoImg from "../assets/logo.png";
import studentsPhoto from "../assets/images/hero_rwanda_students_1790766556338.jpg";
import "./landing.css";

interface LandingPageProps {
  onExplorePlatform: () => void;
  onSignIn: () => void;
}
type Page = "home" | "how-it-works" | "our-approach";
const currentPage = (): Page =>
  window.location.hash === "#how-it-works"
    ? "how-it-works"
    : ["#our-approach", "#principles"].includes(window.location.hash)
      ? "our-approach"
      : "home";

const PlacementGraphic = () => (
  <figure
    className="placement-graphic"
    aria-label="Illustration of student records and school information flowing through rules and AI recommendations to a placement officer for review"
  >
    <div className="placement-graphic-top">
      <span className="landing-eyebrow">The placement journey</span>
      <span className="graphic-example">Illustrative workflow</span>
    </div>
    <div className="placement-flow">
      <div className="placement-inputs">
        <div className="flow-card">
          <GraduationCap size={25} />
          <strong>O’Level candidates</strong>
          <span>Academic results</span>
          <span>School preferences</span>
          <span>Student records</span>
        </div>
        <div className="flow-card">
          <School size={25} />
          <strong>School information</strong>
          <span>Available capacity</span>
          <span>Eligibility & placement rules</span>
        </div>
      </div>
      <div className="flow-connection" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="flow-ai">
        <div className="flow-ai-orbit">
          <Cpu size={42} strokeWidth={1.4} />
        </div>
        <span className="flow-ai-label">Placement AI</span>
        <strong>Find suitable matches</strong>
        <p>
          Rules guide allocation.
          <br />
          AI supports recommendations.
        </p>
        <span className="flow-chip">
          <Check size={13} /> Capacity-aware
        </span>
      </div>
      <div className="flow-connection" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="flow-results">
        <span className="flow-results-title">Placement proposals</span>
        {["Preference match", "Eligible school", "Alternative option"].map(
          (label, i) => (
            <div className="flow-school" key={label}>
              <School size={20} />
              <div>
                <strong>School {String.fromCharCode(65 + i)}</strong>
                <span>{label}</span>
              </div>
              <Check size={15} />
            </div>
          ),
        )}
      </div>
    </div>
    <figcaption className="flow-review">
      <span className="flow-review-icon">
        <FileCheck2 size={23} />
      </span>
      <div>
        <strong>Human review comes next</strong>
        <span>
          Placement officers review, approve, and export final decisions.
        </span>
      </div>
      <span className="flow-review-label">Human-approved</span>
    </figcaption>
  </figure>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  onExplorePlatform,
  onSignIn,
}) => {
  const [page, setPage] = useState<Page>(currentPage);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  useEffect(() => {
    const sync = () => {
      setPage(currentPage());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setVideoPlaying(false));
    else video.pause();
  };
  return (
    <div className={`edumatch-landing landing-page-${page}`}>
      <a
        className="landing-skip"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="landing-header">
        <a href="#home" className="landing-brand" aria-label="EduMatch AI home">
          <img src={logoImg} alt="" />
          <span>
            EduMatch<span className="landing-brand-ai"> AI</span>
          </span>
        </a>
        <nav aria-label="Main navigation" className="landing-nav">
          {(
            [
              ["home", "Home"],
              ["how-it-works", "How it works"],
              ["our-approach", "Our approach"],
            ] as const
          ).map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={page === id ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          className="landing-button landing-button-small"
          onClick={onSignIn}
        >
          Sign in
        </button>
      </header>

      <main id="main-content" tabIndex={-1}>
        {page === "home" && (
          <>
            <section className="landing-hero" aria-labelledby="hero-title">
              <video
                ref={videoRef}
                className="landing-hero-video"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster={studentsPhoto}
                aria-hidden="true"
                tabIndex={-1}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              >
                <source
                  src="/media/building-character-inspiring-success.mp4"
                  type="video/mp4"
                />
              </video>
              <div className="landing-hero-overlay" aria-hidden="true" />
              <div className="landing-hero-copy">
                <h1 id="hero-title">
                  Better Student
                  <br />
                  Placement.
                  <br />
                  <span>Brighter futures.</span>
                </h1>
                <p className="landing-lead">
                  Thoughtful O’Level school placement, supported by AI. Connect
                  students with suitable schools while keeping every decision in
                  human hands.
                </p>
                <div className="landing-hero-actions">
                  <button
                    className="landing-button"
                    onClick={onExplorePlatform}
                  >
                    Explore the platform
                  </button>
                  <a className="landing-text-link" href="#how-it-works">
                    See how it works
                  </a>
                </div>
              </div>
              <button
                className="landing-video-toggle"
                onClick={toggleVideo}
                aria-label={
                  videoPlaying
                    ? "Pause background video"
                    : "Play background video"
                }
              >
                {videoPlaying ? "Pause video" : "Play video"}
              </button>
            </section>
            <div className="landing-context landing-container">
              <span>Built for O’Level placement</span>
              <span>Student preferences</span>
              <span>School capacity</span>
              <span>Clear placement rules</span>
            </div>
            <section className="landing-home-intro landing-container">
              <span className="landing-eyebrow">
                Opportunity begins with a good match
              </span>
              <h2>
                A clearer process.
                <br />A considered decision.
              </h2>
              <p>
                Bring student records, school information, and placement rules
                together. Explore how EduMatch supports your team at every step.
              </p>
              <div className="landing-intro-links">
                <a href="#how-it-works">Discover how it works</a>
                <a href="#our-approach">Explore our approach</a>
              </div>
            </section>
          </>
        )}

        {page === "how-it-works" && (
          <>
            <section className="landing-page-intro landing-container">
              <span className="landing-eyebrow">
                How it works · O’Level placement
              </span>
              <h1>
                From student potential
                <br />
                to a suitable school.
              </h1>
              <p>
                Turn student results, preferences, and school capacity into
                placement proposals your team can understand and review.
              </p>
            </section>
            <div className="landing-container">
              <PlacementGraphic />
            </div>
            <section
              className="landing-section landing-container"
              aria-labelledby="workflow-title"
            >
              <div className="landing-section-heading">
                <div>
                  <span className="landing-eyebrow">
                    One connected workflow
                  </span>
                  <h2 id="workflow-title">Four steps. Clearer decisions.</h2>
                </div>
                <p>
                  AI supports the process. Your placement team keeps control of
                  the outcome.
                </p>
              </div>
              <div className="placement-detail-steps">
                {[
                  [
                    ClipboardList,
                    "01",
                    "Prepare the cohort",
                    "Upload O’Level candidate records, academic results, and school preferences. Check the data before generating proposals.",
                  ],
                  [
                    SlidersHorizontal,
                    "02",
                    "Set the placement rules",
                    "Bring together school capacity, eligibility requirements, and the rules that guide allocation.",
                  ],
                  [
                    Cpu,
                    "03",
                    "Generate proposals",
                    "Run the placement workflow. Use AI-assisted recommendations to help identify suitable alternatives where needed.",
                  ],
                  [
                    FileCheck2,
                    "04",
                    "Review and approve",
                    "Inspect proposals and their explanations. Authorized officers approve final decisions and export placement results.",
                  ],
                ].map(([Icon, number, title, description]) => {
                  const StepIcon = Icon as typeof Cpu;
                  return (
                    <article key={number as string}>
                      <div>
                        <StepIcon size={24} />
                        <span>{number as string}</span>
                      </div>
                      <h3>{title as string}</h3>
                      <p>{description as string}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {page === "our-approach" && (
          <>
            <section className="landing-page-intro landing-container">
              <span className="landing-eyebrow">Our approach</span>
              <h1>
                Built around students.
                <br />
                <span>Led by people.</span>
              </h1>
              <p>
                School placement deserves care, consistency, and accountability.
                We design technology to help placement teams make informed
                decisions.
              </p>
            </section>
            <section
              className="landing-principles"
              aria-labelledby="principles-title"
            >
              <div className="landing-container">
                <div className="landing-section-heading">
                  <div>
                    <span className="landing-eyebrow">
                      Our guiding principles
                    </span>
                    <h2 id="principles-title">Support you can understand.</h2>
                  </div>
                </div>
                <div className="landing-features">
                  <article>
                    <Users size={28} strokeWidth={1.6} />
                    <h3>Human oversight</h3>
                    <p>
                      AI provides decision support. Authorized officers review
                      proposals and remain responsible for final placement
                      approval.
                    </p>
                  </article>
                  <article>
                    <SlidersHorizontal size={28} strokeWidth={1.6} />
                    <h3>Consistent constraints</h3>
                    <p>
                      Eligibility, student preferences, and school capacity
                      provide structure to the placement workflow.
                    </p>
                  </article>
                  <article>
                    <ShieldCheck size={28} strokeWidth={1.6} />
                    <h3>Traceable decisions</h3>
                    <p>
                      Explanations and placement history give your team context
                      to review a recommendation and understand a result.
                    </p>
                  </article>
                </div>
              </div>
            </section>
            <section className="approach-note landing-container">
              <span className="approach-note-icon">
                <GraduationCap size={38} strokeWidth={1.4} />
              </span>
              <div>
                <span className="landing-eyebrow">
                  A student-centered perspective
                </span>
                <h2>Every record represents a future.</h2>
                <p>
                  Academic results are one part of the picture. Student
                  preferences, available school places, and clear rules help
                  your team consider suitable opportunities with care.
                </p>
              </div>
            </section>
          </>
        )}

        <section
          className="landing-cta landing-container"
          aria-labelledby="cta-title"
        >
          <div>
            <span className="landing-eyebrow">A good match starts here</span>
            <h2 id="cta-title">Make the next placement count.</h2>
            <p>Bring clarity to your team’s O’Level placement workflow.</p>
          </div>
          <button className="landing-button" onClick={onExplorePlatform}>
            Open the platform
          </button>
        </section>
      </main>
      <footer className="site-footer">
        <div className="landing-container">
          <div className="site-footer-main">
            <div className="site-footer-about">
              <a className="landing-brand" href="#home" aria-label="EduMatch AI home">
                <img src={logoImg} alt="" />
                <span>EduMatch<span className="landing-brand-ai"> AI</span></span>
              </a>
              <p>Connecting student potential with school opportunity. A clearer way to manage O’Level placement.</p>
              <span className="site-footer-tag"><ShieldCheck size={16} /> Designed for human oversight</span>
            </div>
            <nav className="site-footer-links" aria-label="Footer explore">
              <h2>Explore</h2>
              <a href="#home">Home</a>
              <a href="#how-it-works">How it works</a>
              <a href="#our-approach">Our approach</a>
            </nav>
            <nav className="site-footer-links" aria-label="Footer platform">
              <h2>Platform</h2>
              <button type="button" onClick={onExplorePlatform}>Placement workspace</button>
              <button type="button" onClick={onSignIn}>Account sign in</button>
              <p>For authorized school placement teams.</p>
            </nav>
            <div className="site-footer-access">
              <span className="landing-eyebrow">Your next step</span>
              <h2>Ready to get started?</h2>
              <p>Access your account to manage your placement workflow.</p>
              <button type="button" className="landing-button landing-button-small" onClick={onSignIn}>Sign in to EduMatch</button>
            </div>
          </div>
          <div className="site-footer-bottom">
            <span>© {new Date().getFullYear()} EduMatch AI. All rights reserved.</span>
            <span>O’Level school placement · AI-assisted. Human-approved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
