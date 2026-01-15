import type { Metadata } from 'next';

interface BaseMetadata {
  title: string;
  description: string;
  keywords?: string[];
  image?: string;
  url?: string;
}

interface PageMetadata extends BaseMetadata {
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://statepulse.com';
const defaultImage = `${baseUrl}/images/og-default.png`;

export function generateMetadata({
  title,
  description,
  keywords = [],
  image = defaultImage,
  url,
  type = 'website',
  publishedTime,
  modifiedTime,
  author,
  section,
}: PageMetadata): Metadata {
  const fullTitle = title.includes('AI Legislation Tracker') ? title : `${title} | AI Legislation Tracker`;
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;

  return {
    title: fullTitle,
    description,
    keywords: [...keywords, 'AI Legislation Tracker', 'AI policy', 'tech regulation', 'government'].join(', '),
    authors: author ? [{ name: author }] : [{ name: 'AI Legislation Tracker' }],
    creator: 'AI Legislation Tracker',
    publisher: 'AI Legislation Tracker',
    openGraph: {
      title: fullTitle,
      description,
      url: fullUrl,
      siteName: 'AI Legislation Tracker',
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'en_US',
      type: type as any,
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
      ...(section && { section }),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [image],
      creator: '@AILegislationTracker',
      site: '@AILegislationTracker',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    verification: {
      google: process.env.GOOGLE_VERIFICATION,
    },
  };
}

// Pre-defined metadata for common pages
export const pageMetadata = {
  home: generateMetadata({
    title: 'AI Legislation Tracker - Monitor AI Policy Across the US',
    description: 'Track artificial intelligence legislation, executive orders, and policy developments across state and federal governments.',
    keywords: ['AI policy', 'artificial intelligence', 'legislation', 'state government', 'federal government', 'tech policy'],
    url: '/',
  }),

  representatives: generateMetadata({
    title: 'Representatives - Find Policymakers',
    description: 'Search and filter state and federal representatives involved in AI policy. Track their voting records and stances on artificial intelligence.',
    keywords: ['representatives', 'policymakers', 'congress', 'state legislature', 'AI policy'],
    url: '/representatives',
  }),

  legislation: generateMetadata({
    title: 'AI Policy Updates - Latest Legislative Developments',
    description: 'Stay updated with the latest AI policy developments. Filter by category or search for specific AI topics affecting state and federal legislation.',
    keywords: ['legislation', 'AI policy', 'artificial intelligence', 'bills', 'tech regulation'],
    url: '/legislation',
  }),

  dashboard: generateMetadata({
    title: 'Dashboard - AI Policy Visualization',
    description: 'Interactive map powered analysis for AI policy trends, representatives, and legislative activity.',
    keywords: ['dashboard', 'AI tracking', 'visualization', 'map', 'interactive', 'policy trends'],
    url: '/dashboard',
  }),

  summaries: generateMetadata({
    title: 'AI Summaries - Simplified Policy Analysis',
    description: 'AI-powered summaries of complex legislation and policy documents, making government information accessible and understandable.',
    keywords: ['AI summaries', 'policy analysis', 'legislation summaries', 'government documents'],
    url: '/summaries',
  }),

  about: generateMetadata({
    title: 'About AI Legislation Tracker',
    description: 'Learn about our mission to track and analyze artificial intelligence legislation across the United States.',
    keywords: ['about', 'mission', 'AI safety', 'tech policy', 'transparency'],
    url: '/about',
  }),

  tracker: generateMetadata({
    title: 'Bill Tracker - Follow AI Legislation',
    description: 'Track the progress of important AI bills and legislation through the legislative process.',
    keywords: ['bill tracker', 'legislative progress', 'bill status', 'AI regulation'],
    url: '/tracker',
  }),

  civic: generateMetadata({
    title: 'Civic Engagement - Get Involved',
    description: 'Tools and resources for engaging with AI policy. Find ways to participate and make your voice heard.',
    keywords: ['civic engagement', 'AI policy', 'political participation'],
    url: '/civic',
  }),

  posts: generateMetadata({
    title: 'Community Posts - AI Policy Discussion',
    description: 'Join the community discussion on AI policy topics, share insights, and engage with others.',
    keywords: ['community', 'policy discussion', 'AI safety', 'tech ethics'],
    url: '/posts',
  }),

  privacy: generateMetadata({
    title: 'Privacy Policy',
    description: 'Learn how AI Legislation Tracker collects, uses, and protects your information.',
    keywords: ['privacy policy', 'data protection'],
    url: '/privacy',
  }),

  terms: generateMetadata({
    title: 'Terms of Service',
    description: 'Terms of service and guidelines for using the AI Legislation Tracker platform.',
    keywords: ['terms of service', 'guidelines'],
    url: '/terms',
  }),
};

// Dynamic metadata generators for parameterized pages
export function generateRepresentativeMetadata(name: string, title: string, state?: string) {
  return generateMetadata({
    title: `${name} - ${title}${state ? ` (${state})` : ''}`,
    description: `View ${name}'s AI policy record and updates. Track this ${title.toLowerCase()}'s activities on artificial intelligence issues.`,
    keywords: [name, title.toLowerCase(), 'AI policy', 'voting record', state].filter(Boolean) as string[],
    url: `/representatives/${name.toLowerCase().replace(/\s+/g, '-')}`,
  });
}

export function generateLegislationMetadata(billTitle: string, billNumber?: string, jurisdiction?: string, summary?: string) {
  return generateMetadata({
    title: `${billNumber ? `${jurisdiction} - ${billNumber} ` : ''}${billTitle}`,
    description: summary || `Details and analysis of ${billTitle}. Track the progress and impact of this AI legislation.`,
    keywords: ['legislation', 'bill', billNumber, billTitle.toLowerCase(), 'AI policy', jurisdiction].filter(Boolean) as string[],
    type: 'article',
  });
}

export function generatePostMetadata(title: string, excerpt?: string, author?: string, publishedTime?: string) {
  return generateMetadata({
    title,
    description: excerpt || `AI policy discussion: ${title}`,
    keywords: ['community post', 'AI policy', 'discussion'],
    type: 'article',
    author,
    publishedTime,
    section: 'Community',
  });
}

export function generateUserProfileMetadata(username: string) {
  return generateMetadata({
    title: `${username}'s Profile`,
    description: `View ${username}'s profile and activity on AI Legislation Tracker.`,
    keywords: ['user profile', 'community member', username],
    url: `/users/${username}`,
  });
}
