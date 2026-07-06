import { useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Dialog } from "@/components/Dialog";
import { BottomSheet } from "@/components/BottomSheet";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { PLAYER_COLORS } from "@/theme/tokens";
import { ENGINE_VERSION } from "@aadesipo/engine";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-heading text-text-primary">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export function Gallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { showToast } = useToast();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-6 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-display-xl text-brand-primary-strong">AadesiPo</h1>
          <p className="text-body text-text-secondary">
            Component gallery — M2 · engine {ENGINE_VERSION}
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Typography">
        <div className="flex flex-col gap-1">
          <p className="font-display text-display-xl">Display XL</p>
          <p className="font-display text-display">Display</p>
          <p className="font-display text-title">Title</p>
          <p className="font-body text-heading">Heading</p>
          <p className="font-body text-body-lg">Body large</p>
          <p className="font-body text-body">Body</p>
          <p className="font-body text-caption text-text-secondary">Caption</p>
          <p className="font-body text-micro text-text-disabled">Micro</p>
        </div>
      </Section>

      <Section title="Buttons">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="icon" aria-label="Example icon button">
          ⭐
        </Button>
        <Button variant="primary" loading>
          Loading
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </Section>

      <Section title="Cards">
        <Card className="w-48">Static card</Card>
        <Card interactive className="w-48">
          Interactive card (tap me)
        </Card>
      </Section>

      <Section title="Player colors">
        {PLAYER_COLORS.map((color, i) => (
          <div
            key={color}
            className="flex h-12 w-12 items-center justify-center rounded-full text-caption font-semibold text-[#1A1200]"
            style={{ backgroundColor: color }}
          >
            P{i + 1}
          </div>
        ))}
      </Section>

      <Section title="Toasts">
        <Button variant="secondary" onClick={() => showToast("Property purchased!", "success")}>
          Success toast
        </Button>
        <Button variant="secondary" onClick={() => showToast("Rent overdue", "warn")}>
          Warn toast
        </Button>
        <Button variant="secondary" onClick={() => showToast("Connection lost", "error")}>
          Error toast
        </Button>
      </Section>

      <Section title="Dialog & BottomSheet">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open bottom sheet
        </Button>
      </Section>

      <Section title="Glossary tooltip">
        <p className="text-body">
          It's <GlossaryTerm entryKey="pelli-sandadhi" /> season again — every{" "}
          <GlossaryTerm entryKey="bava" /> in the family has an opinion.
        </p>
      </Section>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Declare bankruptcy?">
        <p className="mb-6 text-body text-text-secondary">
          This is an example blocking decision — reserved for things like bankruptcy or leaving a
          game mid-session.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="tertiary" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => setDialogOpen(false)}>
            Confirm
          </Button>
        </div>
      </Dialog>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <h2 className="mb-2 font-display text-title">Buy MG Road?</h2>
        <p className="mb-6 text-body text-text-secondary">
          Example in-game decision sheet — buy/auction/trade prompts render here.
        </p>
        <Button variant="primary" onClick={() => setSheetOpen(false)} className="w-full">
          Buy for ₹1,200
        </Button>
      </BottomSheet>
    </main>
  );
}
