"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, BarChart3, Landmark, Newspaper } from 'lucide-react';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import StatisticsShowcase from './StatisticsShowcase';

import dynamic from 'next/dynamic';
const ParallaxShowcase = dynamic(() => import('./ParallaxShowcase'), { ssr: false });
const MapShowcase = dynamic(() => import('./MapShowcase'), { ssr: false });
const ExamplesShowcase = dynamic(() => import('./ExamplesShowcase'), { ssr: false });

export default function HomePageClient() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <AnimatedSection className="bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground py-24 px-6 md:px-10 text-center rounded-md shadow-lg overflow-hidden">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
          AI Legislation Tracker
        </h1>
        <p className="text-lg md:text-xl text-primary-foreground/90 mb-10 max-w-3xl mx-auto leading-relaxed">
          The comprehensive platform for tracking AI legislation across the United States. Stay ahead of the curve with real-time updates and analysis from the federal level down to state houses.
        </p>
        <div className="space-x-2 sm:space-x-4">
          <Button asChild size="lg" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 shadow-md hover:shadow-lg transition-shadow px-8 py-3 rounded-lg">
            <Link href="/dashboard">
              Explore Dashboard <ArrowRight className="ml-2.5 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </AnimatedSection>


      {/* Map Showcase Section */}
      <MapShowcase />

      {/* Statistics Showcase Section */}
      <StatisticsShowcase />

      {/* Examples Showcase Section */}
      <ExamplesShowcase />

      {/* Parallax Showcase Section */}
      {/* <ParallaxShowcase /> */}

      {/* Call to Action Section */}
      <AnimatedSection className="bg-muted/70 py-20 px-6 md:px-10 rounded-md shadow-lg overflow-hidden">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6 tracking-tight">
            Ready to Dive In?
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Start exploring legislation now or sign up for personalized alerts and features.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild size="lg" className="px-10 py-3 shadow-md hover:shadow-lg transition-shadow rounded-lg">
              <Link href="/legislation">
                View Latest Legislation
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-10 py-3 shadow-md hover:shadow-lg transition-shadow rounded-lg">
              <Link href="/dashboard">
                View Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </AnimatedSection>
      {/* Donate Callout Section removed for generic version */}
    </div>
  );
}
