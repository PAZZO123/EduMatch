import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Lock,
  Eye,
  UserCheck,
  Sparkles,
  ArrowDown,
  Mail,
  FileText,
  ExternalLink,
  X
} from 'lucide-react';

// Authentic Rwandan secondary education photography
import heroRwandaStudents from '../assets/images/hero_rwanda_students_1790766556338.jpg';
import classroomRwandaStudents from '../assets/images/classroom_rwanda_students_1790766599114.jpg';
import learningRwandaGroup from '../assets/images/learning_rwanda_group_1790766616806.jpg';
import impactRwandaStudents from '../assets/images/impact_rwanda_students_1790766631214.jpg';
import campusRwandaPathway from '../assets/images/campus_rwanda_pathway_1790766641897.jpg';

interface LandingPageProps {
  onExplorePlatform: () => void;
  onSignIn: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onExplorePlatform,
  onSignIn
}) => {
  const [selectedPreviewStudent, setSelectedPreviewStudent] = useState<string>('S10452');
  const [approvedState, setApprovedState] = useState<boolean>(false);
  const [resourceModal, setResourceModal] = useState<{ title: string; content: string } | null>(null);

  // Hero Full-Bleed Slideshow State
  const [activeSlide, setActiveSlide] = useState(0);
  const [isSlidePaused, setIsSlidePaused] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll listener for smooth transparent to translucent navbar transition
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 3 Slides Content from specifications
  const heroSlides = [
    {
      id: 1,
      image: heroRwandaStudents,
      alt: 'Authentic Rwandan secondary-school students in uniform walking on campus courtyard',
      label: 'EDUMATCH AI',
      headline: 'Smarter Student-School Matching',
      caption: 'EduMatch AI helps match students with suitable secondary schools using academic results, preferences, school capacity, and placement rules.',
      cta: 'Explore Platform',
      action: onExplorePlatform,
      secondaryCta: 'How It Works',
      secondaryHref: '#how-it-works'
    },
    {
      id: 2,
      image: learningRwandaGroup,
      alt: 'Rwandan secondary students collaborating with study books and materials in learning hall',
      label: 'AI-ASSISTED PLACEMENT',
      headline: 'Better Recommendations. Better Opportunities.',
      caption: 'AI analyzes student information and placement requirements to recommend suitable schools while making the reasoning clear.',
      cta: 'See How It Works',
      action: () => {
        const el = document.getElementById('how-it-works');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      },
      secondaryCta: 'Explore Platform',
      secondaryAction: onExplorePlatform
    },
    {
      id: 3,
      image: classroomRwandaStudents,
      alt: 'Rwandan secondary school students in classroom environment during national examination prep',
      label: 'AI + HUMAN OVERSIGHT',
      headline: 'AI Recommends. Humans Decide.',
      caption: 'EduMatch AI supports placement officers with transparent recommendations while keeping final placement decisions under human control.',
      cta: 'Explore EduMatch AI',
      action: onExplorePlatform,
      secondaryCta: 'View Placement Flow',
      secondaryHref: '#trust'
    }
  ];

  // Auto-play slideshow every 3 seconds (pauses on hover/interaction)
  useEffect(() => {
    if (isSlidePaused) return;
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % heroSlides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [isSlidePaused, heroSlides.length]);

  const handlePrevSlide = () => {
    setActiveSlide(prev => (prev === 0 ? heroSlides.length - 1 : prev - 1));
  };

  const handleNextSlide = () => {
    setActiveSlide(prev => (prev + 1) % heroSlides.length);
  };

  const studentsMock = {
    S10452: {
      id: '#10452',
      name: 'Mugisha Jean',
      math: 'A',
      english: 'B',
      science: 'A',
      overall: 88,
      choices: ['GS Sainte Famille', 'Lycée de Kigali', 'Collège Saint André'],
      recSchool: 'GS Sainte Famille',
      matchQuality: 94,
      reasons: [
        'Meets academic score threshold (88 ≥ 65)',
        'First preference requested',
        'Capacity available (28 seats open)',
        'All official placement rules satisfied'
      ]
    },
    S10453: {
      id: '#10453',
      name: 'Keza Aline',
      math: 'A',
      english: 'A',
      science: 'A',
      overall: 86,
      choices: ['Lycée de Kigali', 'Collège Saint André', 'GS Sainte Famille'],
      recSchool: 'Lycée de Kigali',
      matchQuality: 91,
      reasons: [
        'Meets academic score threshold (86 ≥ 75)',
        'First preference requested',
        'Capacity available (14 seats open)',
        'All official placement rules satisfied'
      ]
    }
  };

  const activeStudent = studentsMock[selectedPreviewStudent as keyof typeof studentsMock] || studentsMock.S10452;

  const handleOpenResource = (title: string, content: string) => {
    setResourceModal({ title, content });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans selection:bg-[#2563EB] selection:text-white">
      {/* 1. TRANSPARENT NAVBAR OVER HERO */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#0B1F3A]/90 backdrop-blur-md border-b border-white/10 shadow-sm py-3.5'
            : 'bg-transparent border-b border-white/10 py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[6px] bg-[#2563EB] flex items-center justify-center text-white font-bold text-sm shadow-xs ring-1 ring-white/20">
                <span className="font-mono tracking-tighter">E·</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-white font-extrabold text-base tracking-tight">
                  EduMatch
                </span>
                <span className="text-[#99F6E4] font-semibold text-xs px-1.5 py-0.5 rounded-[4px] bg-white/10 border border-white/20">
                  AI
                </span>
              </div>
            </div>

            {/* Simplified Nav Links: How It Works, Platform, AI, Trust, Impact */}
            <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-white/80">
              <a href="#how-it-works" className="hover:text-white transition-colors">
                How It Works
              </a>
              <a href="#platform" className="hover:text-white transition-colors">
                Platform
              </a>
              <a href="#ai" className="hover:text-white transition-colors">
                AI
              </a>
              <a href="#trust" className="hover:text-white transition-colors">
                Trust
              </a>
              <a href="#impact" className="hover:text-white transition-colors">
                Impact
              </a>
            </nav>

            {/* Right CTAs */}
            <div className="flex items-center gap-3">
              <button
                onClick={onSignIn}
                className="px-3.5 py-1.5 text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 rounded-[6px] transition-colors cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={onExplorePlatform}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-600 rounded-[6px] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Explore Platform</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2 & 3. FULL-BLEED IMAGE SLIDESHOW HERO SECTION (Changes every 3s) */}
      <section
        onMouseEnter={() => setIsSlidePaused(true)}
        onMouseLeave={() => setIsSlidePaused(false)}
        className="relative w-full min-h-[90vh] lg:min-h-screen overflow-hidden flex flex-col justify-between text-white select-none border-b border-[#0B1F3A]"
        aria-label="EduMatch AI Hero Slideshow"
      >
        {/* Full-Background Slides with synchronized Image and Caption Crossfade */}
        {heroSlides.map((slide, idx) => {
          const isActive = activeSlide === idx;

          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${
                isActive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'
              }`}
            >
              {/* Full-Cover Background Image */}
              <img
                src={slide.image}
                alt={slide.alt}
                className="absolute inset-0 w-full h-full object-cover object-center transform scale-100"
                referrerPolicy="no-referrer"
              />

              {/* Directional Dark Navy Scrim: Stronger on the left for contrast, fading toward right */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/95 via-[#0B1F3A]/75 to-[#0B1F3A]/35 lg:to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-transparent to-transparent lg:hidden" />

              {/* Corresponding Content for this slide (Transitions together with the image) */}
              <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 lg:pt-36 lg:pb-20 w-full h-full flex flex-col justify-center">
                <div className="max-w-xl lg:max-w-2xl space-y-6 text-left">
                  {/* Small Label */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[6px] bg-white/10 backdrop-blur-md border border-white/20 text-[#99F6E4] text-xs font-mono font-bold tracking-wider uppercase">
                    <span className="w-2 h-2 rounded-full bg-[#0F9D8A] animate-pulse" />
                    <span>{slide.label}</span>
                  </div>

                  {/* Large Responsive Headline (48-64px desktop) */}
                  <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-extrabold text-white tracking-tight leading-[1.08] text-balance">
                    {slide.headline}
                  </h1>

                  {/* Short Caption */}
                  <p className="text-base sm:text-lg text-slate-200 leading-relaxed max-w-xl font-normal">
                    {slide.caption}
                  </p>

                  {/* Primary & Secondary CTAs */}
                  <div className="flex flex-wrap items-center gap-3.5 pt-1">
                    <button
                      onClick={slide.action}
                      className="px-6 py-3.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-600 rounded-[6px] shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <span>{slide.cta}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    {slide.secondaryHref ? (
                      <a
                        href={slide.secondaryHref}
                        className="px-5 py-3.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-[6px] transition-colors"
                      >
                        {slide.secondaryCta}
                      </a>
                    ) : (
                      <button
                        onClick={slide.secondaryAction}
                        className="px-5 py-3.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-[6px] transition-colors cursor-pointer"
                      >
                        {slide.secondaryCta}
                      </button>
                    )}
                  </div>

                  {/* Trust & Scale Micro-Metrics */}
                  <div className="pt-6 border-t border-white/15 flex items-center gap-8 text-xs font-mono">
                    <div>
                      <span className="text-xl sm:text-2xl font-bold text-white block font-sans">149,206</span>
                      <span className="text-slate-300 text-[11px]">Candidates</span>
                    </div>
                    <div>
                      <span className="text-xl sm:text-2xl font-bold text-[#99F6E4] block font-sans">1,890</span>
                      <span className="text-slate-300 text-[11px]">Secondary Schools</span>
                    </div>
                    <div>
                      <span className="text-xl sm:text-2xl font-bold text-[#60A5FA] block font-sans">100%</span>
                      <span className="text-slate-300 text-[11px]">Human Sign-off</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Slideshow Controls Bar (Indicators + Navigation Arrows) */}
        <div className="relative z-30 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full flex items-center justify-between border-t border-white/10 pt-4 mt-auto">
          {/* Numbered Progress Indicators: 01 ━━━━━ 02 ━━━━━ 03 ━━━━━ */}
          <div className="flex items-center gap-4 sm:gap-6">
            {heroSlides.map((slide, idx) => {
              const isActive = activeSlide === idx;

              return (
                <button
                  key={slide.id}
                  onClick={() => setActiveSlide(idx)}
                  className={`group flex items-center gap-2.5 py-1 text-xs font-mono transition-all cursor-pointer ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                >
                  <span className="font-bold">0{idx + 1}</span>
                  <span
                    className={`h-[2px] transition-all duration-300 rounded-full ${
                      isActive ? 'w-10 sm:w-16 bg-[#2563EB]' : 'w-4 sm:w-8 bg-white/20 group-hover:bg-white/40'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Previous / Next Arrow Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevSlide}
              aria-label="Previous slide"
              className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextSlide}
              aria-label="Next slide"
              className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 4 & 5. HOW IT WORKS */}
      <section id="how-it-works" className="py-20 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left: Classroom Photo */}
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="relative rounded-[8px] overflow-hidden border border-[#E2E8F0] shadow-sm aspect-[4/3] bg-slate-100">
                <img
                  src={classroomRwandaStudents}
                  alt="Rwandan secondary students studying inside sunlit classroom"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/60 via-transparent to-transparent flex items-end p-5 text-white">
                  <span className="text-xs font-medium">
                    National examination candidates preparing for secondary school selection
                  </span>
                </div>
              </div>
            </div>

            {/* Right: 4-Step Architecture */}
            <div className="lg:col-span-6 space-y-6 text-left order-1 lg:order-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
                  How It Works
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight mt-1">
                  From complex data to confident decisions.
                </h2>
                <p className="text-sm text-[#64748B] mt-2">
                  A four-stage architecture balancing merit, choice, and capacity.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-[4px] bg-[#0B1F3A] text-white flex items-center justify-center font-mono font-bold text-xs">
                      01
                    </span>
                    <div>
                      <div className="font-bold text-xs text-[#0B1F3A]">Student Data</div>
                      <div className="text-[11px] text-[#64748B]">Examination results and 3 ranked preferences</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>

                <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-[4px] bg-[#2563EB] text-white flex items-center justify-center font-mono font-bold text-xs">
                      02
                    </span>
                    <div>
                      <div className="font-bold text-xs text-[#0B1F3A]">School Data</div>
                      <div className="text-[11px] text-[#64748B]">Capacity quotas and academic score thresholds</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>

                <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-[4px] bg-[#0F9D8A] text-white flex items-center justify-center font-mono font-bold text-xs">
                      03
                    </span>
                    <div>
                      <div className="font-bold text-xs text-[#0B1F3A]">AI Matching</div>
                      <div className="text-[11px] text-[#64748B]">Constraint satisfaction and fallback compatibility ranking</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>

                <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-[4px] bg-[#16A34A] text-white flex items-center justify-center font-mono font-bold text-xs">
                      04
                    </span>
                    <div>
                      <div className="font-bold text-xs text-[#0B1F3A]">Human Approval</div>
                      <div className="text-[11px] text-[#64748B]">NESA officers review recommendations and sign off</div>
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. PLATFORM SECTION */}
      <section id="platform" className="py-20 border-b border-[#E2E8F0] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
              Platform
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight mt-1">
              The Officer Placement Console
            </h2>
            <p className="text-sm text-[#64748B] mt-1.5">
              Decision-support interface built for clarity, speed, and accountability.
            </p>
          </div>

          <div className="max-w-5xl mx-auto bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 mb-6">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-xs text-[#2563EB]">
                  Candidate {activeStudent.id}
                </span>
                <span className="text-[#64748B] text-xs">·</span>
                <span className="text-xs font-bold text-[#0B1F3A]">{activeStudent.name}</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-[#D97706] border border-amber-200 text-[11px] font-semibold">
                Needs Officer Sign-off
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              {/* Left Profile */}
              <div className="md:col-span-6 space-y-5 bg-white p-5 rounded-[8px] border border-[#E2E8F0]">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A] mb-2">
                    Academic Performance
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-[6px]">
                      <span className="text-[11px] text-[#64748B] block">Math</span>
                      <span className="font-bold text-[#0B1F3A] text-base">{activeStudent.math}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-[6px]">
                      <span className="text-[11px] text-[#64748B] block">English</span>
                      <span className="font-bold text-[#0B1F3A] text-base">{activeStudent.english}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-[6px]">
                      <span className="text-[11px] text-[#64748B] block">Science</span>
                      <span className="font-bold text-[#0B1F3A] text-base">{activeStudent.science}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A] mb-2">
                    Ranked Choices
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {activeStudent.choices.map((c, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-[6px] border flex items-center justify-between ${
                          c === activeStudent.recSchool
                            ? 'bg-[#F0FDFA] border-[#0F9D8A]/30 font-semibold text-[#0F172A]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        <span>{i + 1}. {c}</span>
                        {c === activeStudent.recSchool && (
                          <span className="text-[10px] font-bold text-[#0F9D8A] uppercase">Matched</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right AI Recommendation */}
              <div className="md:col-span-6 bg-[#F0FDFA] border border-[#CCFBF1] rounded-[8px] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#99F6E4]/40 pb-3">
                  <span className="text-xs font-mono font-bold uppercase text-[#0F9D8A]">
                    AI RECOMMENDATION
                  </span>
                  <span className="text-xs font-semibold text-[#0F9D8A] bg-white px-2 py-0.5 rounded-[4px] border border-[#99F6E4]">
                    AI Recommended
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-[#0B1F3A]">
                      {activeStudent.recSchool}
                    </h3>
                    <div className="text-xs text-[#64748B]">
                      General O-Level Track · 28 Seats Free
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-3xl font-extrabold font-sans text-[#0B1F3A] tabular-nums">
                      {activeStudent.matchQuality}
                    </div>
                    <div className="text-[11px] text-[#64748B]">Match Quality</div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 text-xs">
                  {activeStudent.reasons.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-[#0F172A]">
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => setApprovedState(true)}
                    className="flex-1 py-2.5 px-3 bg-[#16A34A] hover:bg-emerald-700 text-white font-semibold text-xs rounded-[6px] transition-colors cursor-pointer text-center"
                  >
                    {approvedState ? '✓ Approved' : 'Approve Placement'}
                  </button>
                  <button
                    onClick={onExplorePlatform}
                    className="py-2.5 px-3.5 bg-white hover:bg-slate-50 text-[#0B1F3A] border border-[#E2E8F0] font-semibold text-xs rounded-[6px] transition-colors cursor-pointer"
                  >
                    View Alternatives
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. AI SECTION (EXPLAINABLE AI) */}
      <section id="ai" className="py-20 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-4 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0F9D8A]">
                Explainability
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight">
                AI that explains its recommendations.
              </h2>
              <p className="text-sm text-[#64748B] leading-relaxed">
                EduMatch does not output black-box scores. Every match provides verifiable reasons so officers make informed decisions.
              </p>
            </div>

            <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-[8px] border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <span className="font-bold text-xs text-[#0B1F3A] uppercase tracking-wider">
                  Recommendation Factors
                </span>
                <span className="font-mono text-xs font-bold text-[#0F9D8A]">
                  Quality: 94
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] space-y-1">
                  <div className="flex justify-between font-semibold text-[#0B1F3A]">
                    <span>Academic Fit</span>
                    <span className="font-mono text-[#0F9D8A]">100%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#0F9D8A] h-full w-full" />
                  </div>
                  <span className="text-[10px] text-[#64748B] block">Exceeds threshold 65</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] space-y-1">
                  <div className="flex justify-between font-semibold text-[#0B1F3A]">
                    <span>Preference</span>
                    <span className="font-mono text-[#0F9D8A]">90%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#0F9D8A] h-full w-[90%]" />
                  </div>
                  <span className="text-[10px] text-[#64748B] block">First choice matched</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] space-y-1">
                  <div className="flex justify-between font-semibold text-[#0B1F3A]">
                    <span>Capacity</span>
                    <span className="font-mono text-[#0F9D8A]">100%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#0F9D8A] h-full w-full" />
                  </div>
                  <span className="text-[10px] text-[#64748B] block">28 seats available</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] space-y-1">
                  <div className="flex justify-between font-semibold text-[#0B1F3A]">
                    <span>Rules</span>
                    <span className="font-mono text-[#0F9D8A]">100%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#0F9D8A] h-full w-full" />
                  </div>
                  <span className="text-[10px] text-[#64748B] block">Zero policy breaches</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. TRUST SECTION */}
      <section id="trust" className="py-20 border-b border-[#E2E8F0] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-10">
          <div className="max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
              Trust
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-[#0B1F3A] tracking-tight">
              AI recommends. Humans decide.
            </h2>
            <p className="text-base text-[#64748B] max-w-xl mx-auto leading-relaxed">
              Authorized NESA officers retain complete authority to review, approve, or reassign placements.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs text-left">
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
              <span className="text-[10px] font-mono text-[#64748B] block">01</span>
              <span className="font-bold text-[#0B1F3A] block mt-0.5">AI Recommendation</span>
              <span className="text-[11px] text-[#64748B]">Proposes candidates</span>
            </div>

            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
              <span className="text-[10px] font-mono text-[#64748B] block">02</span>
              <span className="font-bold text-[#0B1F3A] block mt-0.5">Officer Review</span>
              <span className="text-[11px] text-[#64748B]">Verifies facts</span>
            </div>

            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
              <span className="text-[10px] font-mono text-[#64748B] block">03</span>
              <span className="font-bold text-[#0B1F3A] block mt-0.5">Approve or Change</span>
              <span className="text-[11px] text-[#64748B]">Controlled override</span>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-[6px]">
              <span className="text-[10px] font-mono text-[#16A34A] block">04</span>
              <span className="font-bold text-[#16A34A] block mt-0.5">Final Placement</span>
              <span className="text-[11px] text-emerald-800">Confirmed officially</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-4xl mx-auto text-xs pt-4">
            <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] font-semibold text-[#0B1F3A]">
              Human Oversight
            </div>
            <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] font-semibold text-[#0B1F3A]">
              Explainability
            </div>
            <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] font-semibold text-[#0B1F3A]">
              Rule Compliance
            </div>
            <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] font-semibold text-[#0B1F3A]">
              Privacy
            </div>
            <div className="p-3 bg-slate-50 rounded-[6px] border border-[#E2E8F0] font-semibold text-[#0B1F3A] col-span-2 sm:col-span-1">
              Auditability
            </div>
          </div>
        </div>
      </section>

      {/* 10. IMPACT SECTION */}
      <section id="impact" className="py-20 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7">
              <div className="relative rounded-[8px] overflow-hidden border border-[#E2E8F0] shadow-sm aspect-[16/10] bg-slate-100">
                <img
                  src={impactRwandaStudents}
                  alt="Rwandan secondary school students on campus terrace overlooking Kigali hills"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/70 via-transparent to-transparent flex items-end p-6 text-white">
                  <span className="text-xs font-semibold">
                    Equitable educational access for secondary students across Rwanda
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6 text-left">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
                  Impact
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight mt-1">
                  Designed for national scale.
                </h2>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-white rounded-[6px] border border-[#E2E8F0]">
                  <h3 className="text-base font-bold text-[#0B1F3A]">Faster decisions.</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Reduces placement turnaround from weeks to instantaneous proposals.
                  </p>
                </div>

                <div className="p-4 bg-white rounded-[6px] border border-[#E2E8F0]">
                  <h3 className="text-base font-bold text-[#0B1F3A]">Better matching.</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Matches subject aptitude with specialized academic programmes.
                  </p>
                </div>

                <div className="p-4 bg-white rounded-[6px] border border-[#E2E8F0]">
                  <h3 className="text-base font-bold text-[#0B1F3A]">More transparency.</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Every match is explainable with recorded criteria.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 11. FINAL CTA SECTION */}
      <section className="relative py-24 text-white text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={campusRwandaPathway}
            alt="Rwandan secondary school campus"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-[#0B1F3A]/90" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <span className="text-xs font-mono uppercase tracking-wider text-[#0F9D8A] font-semibold">
            National Education Infrastructure
          </span>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Better data.<br />
            Better decisions.<br />
            <span className="text-[#0F9D8A]">Better opportunities.</span>
          </h2>
          <p className="text-sm text-slate-200 max-w-md mx-auto leading-relaxed">
            EduMatch AI brings intelligent recommendations and human judgment together for more efficient student placement.
          </p>

          <div className="pt-2">
            <button
              onClick={onExplorePlatform}
              className="px-6 py-3.5 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-sm rounded-[6px] shadow-sm transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Explore the Platform</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* REDESIGNED PROFESSIONAL & SPACIOUS FOOTER */}
      <footer className="bg-[#0B1F3A] text-slate-300 pt-16 pb-12 sm:pt-20 sm:pb-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12">
            {/* Col 1: Strong Brand Area (5 Cols) */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[8px] bg-[#2563EB] flex items-center justify-center text-white font-bold text-base shadow-sm ring-1 ring-white/10">
                  <span className="font-mono tracking-tighter">E·</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-extrabold text-xl tracking-tight">
                    EduMatch
                  </span>
                  <span className="text-[#0F9D8A] font-semibold text-xs px-1.5 py-0.5 rounded-[4px] bg-[#0F9D8A]/15 border border-[#0F9D8A]/30">
                    AI
                  </span>
                </div>
              </div>

              <div className="text-sm font-semibold text-slate-200">
                Smarter Placement. Better Opportunities.
              </div>

              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                AI-assisted school placement that helps connect students with suitable schools while keeping humans in control.
              </p>

              <div className="pt-2">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-[#0F9D8A] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0F9D8A]" />
                  <span>AI-assisted. Human-approved.</span>
                </span>
              </div>
            </div>

            {/* Col 2: Platform Links (2-3 Cols) */}
            <div className="md:col-span-2 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Platform
              </div>
              <ul className="space-y-3 text-xs">
                <li>
                  <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#platform" className="text-slate-300 hover:text-white transition-colors">
                    Platform
                  </a>
                </li>
                <li>
                  <a href="#ai" className="text-slate-300 hover:text-white transition-colors">
                    Explainability
                  </a>
                </li>
                <li>
                  <a href="#trust" className="text-slate-300 hover:text-white transition-colors">
                    Trust
                  </a>
                </li>
                <li>
                  <a href="#impact" className="text-slate-300 hover:text-white transition-colors">
                    Impact
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Product Capabilities (2-3 Cols) */}
            <div className="md:col-span-2 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Product
              </div>
              <ul className="space-y-3 text-xs">
                <li>
                  <button
                    onClick={onExplorePlatform}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    Student Matching
                  </button>
                </li>
                <li>
                  <button
                    onClick={onExplorePlatform}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    School Recommendations
                  </button>
                </li>
                <li>
                  <button
                    onClick={onExplorePlatform}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    AI Insights
                  </button>
                </li>
                <li>
                  <button
                    onClick={onExplorePlatform}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    Placement Review
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 4: Resources (3 Cols) */}
            <div className="md:col-span-3 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Resources
              </div>
              <ul className="space-y-3 text-xs">
                <li>
                  <button
                    onClick={() => handleOpenResource(
                      'Documentation & Guidelines',
                      'EduMatch AI placement documentation defines deterministic capacity invariants, serial priority tie-breaking conventions, and explainable compatibility scoring for O-Level secondary admission.'
                    )}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    Documentation
                  </button>
                </li>
                <li>
                  <a href="#ai" className="text-slate-300 hover:text-white transition-colors">
                    Responsible AI
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => handleOpenResource(
                      'Privacy & Data Protection',
                      'Student candidate examination scores and identifiers are encrypted at rest. No private contact info or protected demographic attributes are used in AI scoring.'
                    )}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    Privacy
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleOpenResource(
                      'Institutional Contact',
                      'EduMatch AI platform support for authorized education authorities and placement committee officers. Email: contact@nesa.gov.rw'
                    )}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer Bottom Bar */}
          <div className="mt-16 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <div>
              © 2026 EduMatch AI. All rights reserved.
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() => handleOpenResource(
                  'Privacy Policy',
                  'Candidate records are de-identified and handled strictly under national data sovereignty guidelines.'
                )}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Privacy
              </button>
              <button
                onClick={() => handleOpenResource(
                  'Terms of Service',
                  'EduMatch AI operates as a decision-support platform for authorized secondary school placement officers.'
                )}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Terms
              </button>
              <button
                onClick={() => handleOpenResource(
                  'Contact Support',
                  'National Examination and School Inspection Authority (NESA) O-Level Placement Secretariat.'
                )}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Resource Modal for Footer Links */}
      {resourceModal && (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-2xl max-w-md w-full p-6 space-y-4 text-xs text-[#0F172A]">
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-base font-bold text-[#0B1F3A]">
                {resourceModal.title}
              </h3>
              <button
                onClick={() => setResourceModal(null)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[#64748B] leading-relaxed">
              {resourceModal.content}
            </p>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setResourceModal(null)}
                className="px-4 py-2 bg-[#0B1F3A] hover:bg-slate-800 text-white rounded-[6px] font-semibold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
