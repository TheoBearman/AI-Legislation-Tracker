import { Bot, ExternalLink } from "lucide-react";
import Link from "next/link";
import React from "react";

export function StatePulseFooter() {
  return (
    <footer className="border-t bg-background mt-auto">
      <div className="container mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand Section */}
          <div className="flex flex-col items-center md:items-start space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
              <span className="text-base sm:text-lg font-semibold font-headline">
                AI Legislation Tracker
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed text-center md:text-left">
              Tracking artificial intelligence legislation across federal and state governments.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="font-medium text-xs md:text-sm text-foreground mb-3">
              Navigation
            </h3>
            <ul className="list-none pl-0 space-y-2 text-center md:text-left">
              <li><Link href="/" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors">Home</Link></li>
              <li><Link href="/dashboard" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link></li>
              <li><Link href="/legislation" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors">AI Legislation</Link></li>
              <li><Link href="/executive-orders" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors">Executive Orders</Link></li>
              <li><Link href="/representatives" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors">Representatives</Link></li>
            </ul>
          </div>

          {/* Data Sources */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="font-medium text-xs md:text-sm text-foreground mb-3">
              Data Sources
            </h3>
            <ul className="list-none pl-0 space-y-2 text-center md:text-left">
              <li>
                <a href="https://openstates.org" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                  OpenStates <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a href="https://congress.gov" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                  Congress.gov <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a href="https://whitehouse.gov" target="_blank" rel="noopener noreferrer" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                  White House <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t mt-6 pt-6 flex flex-col space-y-2 md:space-y-0 md:flex-row md:justify-between md:items-center">
          <p className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
            © {new Date().getFullYear()} AI Legislation Tracker. Data updated regularly.
          </p>
          <p className="text-xs md:text-sm text-muted-foreground text-center md:text-right">
            Tracking AI policy for informed decision-making.
          </p>
        </div>
      </div>
    </footer>
  );
}
