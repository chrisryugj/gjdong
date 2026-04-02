import AddressGenerator from "@/components/address-generator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="mx-auto max-w-2xl">
          <AddressGenerator />

          <footer className="mt-6 flex items-center justify-between px-1 text-[11px] text-muted-foreground/60">
            <span>류주임 · 광진구청 AI.Do</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <img
                      src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgjdong.vercel.app%2F&label=AI-Do&icon=pin-map-fill&color=%23adb5bd&message=&style=flat&tz=Asia%2FSeoul"
                      alt="AI-Do hits counter"
                      className="h-5"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Last updated at 2025.10.27. 17:16</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </footer>
        </div>
      </div>
    </main>
  )
}
