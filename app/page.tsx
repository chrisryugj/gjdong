import AddressGenerator from "@/components/address-generator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <div className="flex items-baseline justify-center gap-3">
              <h1
                className="text-5xl font-bold tracking-tight whitespace-nowrap md:text-7xl lg:text-8xl"
                style={{ fontFamily: "Shilla, sans-serif" }}
              >
                표준주소실록
              </h1>
              <span
                className="text-lg font-medium text-muted-foreground md:text-xl lg:text-2xl"
                style={{ fontFamily: "Shilla, sans-serif" }}
              >
                v1.2
              </span>
            </div>
          </div>

          <AddressGenerator />

          <footer className="mt-12 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Copyright 2025.10. <span className="text-muted-foreground/40">개친절한</span> 류주임. All right reserved.
            </p>
            <div className="flex justify-center">
              <span className="inline-flex items-center rounded-full bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground/80 border border-border/50">
                광진구청 AI 동호회- AI.Do
              </span>
            </div>
            <TooltipProvider>
              <div className="flex justify-center pt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help inline-block">
                      <img
                        src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgjdong.vercel.app%2F&label=AI-Do&icon=pin-map-fill&color=%23adb5bd&message=&style=flat&tz=Asia%2FSeoul"
                        alt="AI-Do hits counter"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Last updated at 2025.10.27. 17:16</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </footer>
        </div>
      </div>
    </main>
  )
}
