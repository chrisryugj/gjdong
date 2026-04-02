import AddressGenerator from "@/components/address-generator"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="mx-auto max-w-2xl">
          <AddressGenerator />

          <footer className="mt-6 flex items-center justify-center gap-3 text-[11px] text-muted-foreground/50">
            <span>류주임 · 광진구청 AI.Do</span>
            <span className="text-muted-foreground/30">·</span>
            <img
              src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgjdong.vercel.app%2F&label=AI-Do&icon=pin-map-fill&color=%23adb5bd&message=&style=flat&tz=Asia%2FSeoul"
              alt="hits"
              className="h-4"
            />
          </footer>
        </div>
      </div>
    </main>
  )
}
