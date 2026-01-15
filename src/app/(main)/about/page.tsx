import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata.about;

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 rounded-lg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
            About AI Legislation Tracker
          </h1>

          <div className="prose prose-lg max-w-none dark:prose-invert">
            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">The Platform</h2>
              <p className="mb-4">
                The AI Legislation Tracker was created to help citizens, researchers, and policymakers understand the rapidly evolving landscape of artificial intelligence regulation.
              </p>
              <p className="mb-4">
                As AI technology advances, so does the legislation governing it. This platform empowers users by providing them with the tools they need to stay informed about AI-related laws that shape our digital future.
              </p>
            </AnimatedSection>

            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
              <p className="mb-4">
                We are dedicated to democratizing access to AI policy information. We believe that everyone deserves to understand how artificial intelligence is being regulated, from local ordinances to federal laws.
              </p>
              <p className="mb-4">
                Our platform bridges the gap between complex legislative text and public understanding, making it easier than ever to stay informed about the decisions that shape the future of technology.
              </p>
            </AnimatedSection>

            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">What We Do</h2>
              <p className="mb-4">
                AI Legislation Tracker provides comprehensive tools and resources to help you:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-2">
                <li>Track AI legislation across all 50 states and federal jurisdictions</li>
                <li>Receive AI-powered summaries of complex bills</li>
                <li>Get notifications about new AI-related bills and executive orders</li>
                <li>Analyze trends in AI regulation</li>
              </ul>
            </AnimatedSection>

            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Why It Matters</h2>
              <p className="mb-4">
                Governments are making crucial decisions about AI safety, privacy, and development. Yet most people remain unaware of these policies until they are enacted.
              </p>
              <p className="mb-4">
                We change that by providing real-time access to legislative information, empowering you to participate meaningfully in the conversation about AI governance.
              </p>
            </AnimatedSection>

            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Our Technology</h2>
              <p className="mb-4">
                We leverage cutting-edge artificial intelligence and machine learning to:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-2">
                <li>Automatically summarize complex legislation in multiple formats</li>
                <li>Identify bills that match your specific interests and location</li>
                <li>Provide intelligent insights about potential impacts of proposed laws</li>
                <li>Translate legal jargon into accessible language</li>
                <li>Predict voting outcomes and track bill progress</li>
              </ul>
            </AnimatedSection>

            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Our Commitment</h2>
              <p className="mb-4">
                We are committed to:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-2">
                <li><strong>Accuracy:</strong> We source our data from official government channels.</li>
                <li><strong>Neutrality:</strong> We present information objectively without political bias.</li>
                <li><strong>Transparency:</strong> We're open about our data sources and methodologies.</li>
                <li><strong>Privacy:</strong> We protect your personal information.</li>
              </ul>
            </AnimatedSection>

            <AnimatedSection className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">Special Thanks</h2>
              <p className="mb-4">
                This project relies on the incredible work of open-source projects:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-2">
                <li><strong>Open States Project:</strong> For maintaining comprehensive databases of legislative information.</li>
                <li><strong>MapLibre GL & OpenStreetMap:</strong> For providing the open-source mapping technology.</li>
              </ul>
            </AnimatedSection>
          </div>
        </div>
      </div>
    </div>
  );
}
