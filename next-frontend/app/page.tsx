import Link from "next/link";

import { Button } from "@/components/ui";

type Feature = {
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    title: "Real-time Threat Detection",
    description: "Continuously monitor incoming events and surface high-risk behavior in seconds.",
  },
  {
    title: "Automated Incident Response",
    description: "Trigger playbooks, assign tasks, and execute predefined actions without manual delays.",
  },
  {
    title: "AI-powered Analysis",
    description: "Prioritize noisy alerts with contextual scoring and fast root-cause assistance.",
  },
  {
    title: "Workflow Automation",
    description: "Standardize triage, enrichment, and escalation across your entire response pipeline.",
  },
  {
    title: "Alert Correlation",
    description: "Connect related signals into a single narrative to reduce alert fatigue.",
  },
  {
    title: "Scalable Architecture",
    description: "Built to handle high event volume for growing teams, cloud workloads, and enterprise SOCs.",
  },
];

const steps = [
  "Ingest Logs / Data",
  "Analyze with AI",
  "Detect Threats",
  "Automate Response",
];

const useCases = [
  {
    title: "SOC Teams",
    description: "Improve analyst focus with automated triage and centralized incident workflows.",
  },
  {
    title: "Startups",
    description: "Get enterprise-grade monitoring without building a large security operations team.",
  },
  {
    title: "Enterprises",
    description: "Coordinate cross-team incident response with visibility across environments.",
  },
  {
    title: "Cloud Security",
    description: "Track suspicious cloud activity and respond quickly to modern attack patterns.",
  },
];

const benefits = [
  "Faster incident response and containment",
  "Reduced manual work for analysts",
  "Better threat visibility across systems",
  "Lower security operations cost over time",
];

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground md:text-base">{subtitle}</p>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm md:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">AI Security Operations</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            Stop threats early with an AI-driven SOC built for real-time response.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Ingest logs continuously, detect anomalies instantly, and automate incident workflows so your team can
            respond faster with less manual effort.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signin">Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">View Demo</Link>
            </Button>
          </div>
        </div>
        <DashboardPreview compact />
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
    </article>
  );
}

function FeaturesSection() {
  return (
    <section className="space-y-8">
      <SectionHeading
        eyebrow="Features"
        title="Everything your SOC needs in one intelligent platform"
        subtitle="From ingestion to response, each workflow is designed to reduce analyst overload and improve decision speed."
      />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="space-y-8">
      <SectionHeading
        eyebrow="How It Works"
        title="A clear security workflow from signal to action"
        subtitle="Simple steps keep the team aligned and ensure every critical event gets addressed quickly."
      />
      <div className="grid gap-4 md:grid-cols-4">
        {steps.map((step, index) => (
          <article key={step} className="relative rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-foreground">
              {index + 1}
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{step}</h3>
            {index < steps.length - 1 ? (
              <span className="absolute -right-2 top-8 hidden h-px w-4 bg-border md:block" aria-hidden="true" />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function DashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "rounded-2xl border border-border bg-background p-5 shadow-sm" : "space-y-8"}>
      {compact ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Dashboard Preview</p>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Active Alerts</p>
                <p className="mt-2 text-xl font-semibold text-foreground">142</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Critical</p>
                <p className="mt-2 text-xl font-semibold text-foreground">18</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Response SLA</p>
                <p className="mt-2 text-xl font-semibold text-foreground">96%</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Threat Trend</p>
              <div className="mt-3 grid h-24 grid-cols-10 items-end gap-1">
                {[30, 42, 25, 58, 48, 70, 62, 55, 76, 68].map((value) => (
                  <div key={value} className="rounded-sm bg-primary/70" style={{ height: `${value}%` }} />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <SectionHeading
            eyebrow="Product View"
            title="See incidents, alerts, and analytics in one live command center"
            subtitle="Get complete threat visibility with real-time dashboards, trend analytics, and clear incident prioritization."
          />
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["Total Events", "12,984"],
                ["Open Incidents", "37"],
                ["Automations", "64"],
                ["Analyst Load", "Balanced"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-muted/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-medium text-foreground">Threat Analytics</p>
                <div className="mt-4 grid h-32 grid-cols-12 items-end gap-1">
                  {[25, 40, 35, 60, 45, 74, 52, 66, 48, 72, 58, 80].map((value, index) => (
                    <div
                      key={`${value}-${index}`}
                      className="rounded-sm bg-gradient-to-t from-primary to-accent"
                      style={{ height: `${value}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-sm font-medium text-foreground">Recent Alerts</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="rounded-md border border-border bg-card px-3 py-2">Credential anomaly - high risk</li>
                  <li className="rounded-md border border-border bg-card px-3 py-2">Lateral movement pattern detected</li>
                  <li className="rounded-md border border-border bg-card px-3 py-2">Unusual outbound traffic spike</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function UseCases() {
  return (
    <section className="space-y-8">
      <SectionHeading
        eyebrow="Use Cases"
        title="Built for teams at every security maturity stage"
        subtitle="Whether you are scaling a startup SOC or coordinating enterprise response, workflows stay consistent and fast."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {useCases.map((item) => (
          <article key={item.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm transition duration-300 hover:shadow-md">
            <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className="space-y-8 rounded-3xl border border-border bg-gradient-to-b from-card to-muted/30 p-6 shadow-sm md:p-10">
      <SectionHeading
        eyebrow="Benefits"
        title="Outcomes that matter to leadership and analysts"
        subtitle="Improve operational efficiency while keeping security posture strong with AI-assisted prioritization and response."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {benefits.map((benefit) => (
          <div key={benefit} className="rounded-xl border border-border bg-background/70 px-4 py-3 text-sm text-foreground">
            {benefit}
          </div>
        ))}
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="space-y-8">
      <SectionHeading
        eyebrow="Trusted Teams"
        title="Security leaders trust this platform for mission-critical response"
        subtitle="Placeholder testimonials and trust indicators for conversion-ready social proof."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {[
          "Reduced incident response time by 41% in the first quarter.",
          "Our analysts now focus on true positives, not alert noise.",
          "Playbook automation improved consistency across every shift.",
        ].map((quote, index) => (
          <article key={quote} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm leading-6 text-muted-foreground">"{quote}"</p>
            <p className="mt-4 text-sm font-semibold text-foreground">Security Team {index + 1}</p>
          </article>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-center text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card px-4 py-3">CloudOps</div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">SecureScale</div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">Sentinel Labs</div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">Northstar IT</div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Start Now</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
            Launch your AI SOC workflow in minutes.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Start free to explore real-time monitoring and automation, or book a guided demo with your team.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/signin">Start Free</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Book Demo</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-semibold text-foreground">AI SOC Platform</p>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <Link className="transition hover:text-foreground" href="/dashboard">
            Product
          </Link>
          <Link className="transition hover:text-foreground" href="/signin">
            Docs
          </Link>
          <Link className="transition hover:text-foreground" href="/signin">
            GitHub
          </Link>
          <Link className="transition hover:text-foreground" href="/signin">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-center justify-between rounded-xl border border-border bg-card/80 px-4 py-3 shadow-sm backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI SOC</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/signin">Sign In</Link>
          </Button>
        </header>

        <HeroSection />
        <FeaturesSection />
        <HowItWorks />
        <DashboardPreview />
        <UseCases />
        <BenefitsSection />
        <TestimonialsSection />
        <CTASection />
        <Footer />
      </div>
    </main>
  );
}
