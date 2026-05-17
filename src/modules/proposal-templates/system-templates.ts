export interface SystemTemplate {
  id:          string
  name:        string
  description: string
  category:    string
  isSystem:    true
  totalAmount: number
  usageCount:  number
  content:     Record<string, unknown>
  createdAt:   string
  updatedAt:   string
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id:          'system:web_design',
    name:        'Web Design & Development',
    description: 'Full website design and development — discovery, UI design, development, and launch.',
    category:    'Web Design',
    isSystem:    true,
    totalAmount: 88500,
    usageCount:  0,
    createdAt:   new Date(0).toISOString(),
    updatedAt:   new Date(0).toISOString(),
    content: {
      intro: 'Thank you for considering us for your website project. We specialize in building fast, modern websites that convert visitors into customers. This proposal outlines our approach, deliverables, and investment for your project.',
      whyUs: 'We have delivered 50+ websites for Indian businesses across e-commerce, services, and SaaS. Our process is structured, communication is transparent, and we deliver on time.',
      nextSteps: 'Review this proposal and let us know if you have any questions. Once accepted, we will schedule a kickoff call and share a project timeline.',
      scopeItems: [
        { title: 'Discovery & Planning', description: 'Kickoff call, sitemap finalization, competitor research, and project brief sign-off.' },
        { title: 'UI/UX Design', description: 'Wireframes for all key pages, high-fidelity Figma designs (desktop + mobile), and one round of revisions.' },
        { title: 'Development', description: 'Pixel-perfect implementation in React/Next.js with CMS integration, SEO meta tags, and performance optimization.' },
        { title: 'Testing & Launch', description: 'Cross-browser QA, mobile responsiveness testing, staging review, and live deployment.' },
      ],
      deliverables: [
        { item: 'Figma design files (all pages)', format: 'Figma' },
        { item: 'Fully functional website', format: 'Live URL' },
        { item: 'CMS setup with training', format: 'Recorded video' },
        { item: '30-day post-launch support', format: 'Email/WhatsApp' },
      ],
      exclusions: ['Domain and hosting costs', 'Third-party plugin licenses', 'Content writing or photography', 'Paid ad setup or SEO campaigns'],
      lineItems: [
        { description: 'UI/UX Design (up to 8 pages)', qty: 1, rate: 25000, gstRate: 18 },
        { description: 'Frontend Development',           qty: 1, rate: 40000, gstRate: 18 },
        { description: 'CMS Integration & Setup',        qty: 1, rate: 10000, gstRate: 18 },
      ],
      gstType: 'IGST',
      pricingNotes: 'Prices are exclusive of 18% GST. Hosting and domain renewal billed separately at actuals.',
      paymentSchedule: [
        { milestone: 'Project kickoff',      amount: 25000, dueOn: 'On agreement signing' },
        { milestone: 'Design approval',      amount: 25000, dueOn: 'After Figma sign-off' },
        { milestone: 'Development complete', amount: 25000, dueOn: 'Before launch' },
      ],
      milestones: [
        { title: 'Discovery & Design',  duration: '1 week',  description: 'Sitemap, wireframes, and high-fidelity designs' },
        { title: 'Development',         duration: '2 weeks', description: 'Full implementation and CMS setup' },
        { title: 'Testing & Launch',    duration: '3 days',  description: 'QA, feedback revisions, and go-live' },
      ],
      terms: `1. A 33% advance is required to commence work.\n2. Client to provide all content (text, images, logo) within 3 days of kickoff.\n3. Each phase includes one round of revisions. Additional revisions billed at ₹1,500/hour.\n4. Project timeline starts from receipt of advance and content.\n5. Unused revisions do not carry over to subsequent phases.\n6. Intellectual property transfers to client upon receipt of final payment.`,
    },
  },
  {
    id:          'system:brand_identity',
    name:        'Brand Identity Design',
    description: 'Logo, color palette, typography, and brand guidelines for a new or refreshed brand.',
    category:    'Branding',
    isSystem:    true,
    totalAmount: 35400,
    usageCount:  0,
    createdAt:   new Date(0).toISOString(),
    updatedAt:   new Date(0).toISOString(),
    content: {
      intro: 'A strong brand identity is the foundation of every successful business. This proposal covers the creation of a distinctive visual identity — from logo to brand guidelines — that will represent your business consistently across all touchpoints.',
      whyUs: 'We have built brand identities for 30+ startups and established businesses. Our strategic approach combines aesthetics with business positioning so your brand stands out and resonates with your target audience.',
      nextSteps: 'Once you accept this proposal, we will send a brand discovery questionnaire. Your responses inform our design direction, so the more detail you provide, the better the outcome.',
      scopeItems: [
        { title: 'Brand Discovery', description: 'Brand questionnaire, competitor visual audit, mood board creation, and design direction sign-off.' },
        { title: 'Logo Design', description: 'Three distinct logo concepts, followed by refinement of the chosen direction into a final logo suite (primary, secondary, icon).' },
        { title: 'Visual Identity System', description: 'Color palette, typography selection, iconography style, and pattern/texture elements.' },
        { title: 'Brand Guidelines Document', description: 'A comprehensive PDF guide covering logo usage rules, color codes, typography, and do/don\'t examples.' },
      ],
      deliverables: [
        { item: 'Final logo suite',           format: 'AI, EPS, SVG, PNG (all sizes)' },
        { item: 'Color palette',              format: 'HEX, RGB, CMYK values' },
        { item: 'Typography specification',   format: 'Font names + usage guide' },
        { item: 'Brand guidelines PDF',       format: '15–20 page PDF' },
        { item: 'Social media profile assets', format: 'PNG' },
      ],
      exclusions: ['Stationery or merchandise design', 'Website or app design', 'Social media content creation', 'Packaging design'],
      lineItems: [
        { description: 'Logo Design (3 concepts + refinement)', qty: 1, rate: 15000, gstRate: 18 },
        { description: 'Visual Identity System',                qty: 1, rate: 8000,  gstRate: 18 },
        { description: 'Brand Guidelines Document',             qty: 1, rate: 7000,  gstRate: 18 },
      ],
      gstType: 'IGST',
      pricingNotes: 'All prices are exclusive of 18% GST.',
      paymentSchedule: [
        { milestone: 'Project start',      amount: 15000, dueOn: 'On agreement signing' },
        { milestone: 'Logo approved',      amount: 15000, dueOn: 'After logo sign-off' },
      ],
      milestones: [
        { title: 'Discovery & Moodboards', duration: '3 days',  description: 'Questionnaire review, competitor audit, moodboard presentation' },
        { title: 'Logo Concepts',          duration: '5 days',  description: '3 concepts presented; 1 selected for refinement' },
        { title: 'Visual System',          duration: '3 days',  description: 'Color, typography, and supporting elements' },
        { title: 'Brand Guidelines',       duration: '3 days',  description: 'Complete guidelines document + asset handoff' },
      ],
      terms: `1. 50% advance required to start work.\n2. Three logo concepts presented; client selects one for refinement.\n3. Two rounds of revisions included. Additional revisions at ₹1,200/hour.\n4. All source files transferred upon receipt of final payment.\n5. Designer retains the right to showcase the work in portfolio (unless confidentiality clause requested).`,
    },
  },
  {
    id:          'system:social_media',
    name:        'Social Media Management',
    description: 'Monthly content creation, scheduling, and reporting for Instagram and LinkedIn.',
    category:    'Marketing',
    isSystem:    true,
    totalAmount: 14160,
    usageCount:  0,
    createdAt:   new Date(0).toISOString(),
    updatedAt:   new Date(0).toISOString(),
    content: {
      intro: 'Consistent, high-quality social media presence builds trust and drives inbound leads. This retainer covers everything needed to keep your brand active and growing on Instagram and LinkedIn every month.',
      whyUs: 'We manage social media for 15+ brands across D2C, services, and B2B sectors. Our content is strategy-led, not just aesthetically pleasing — every post serves a clear business objective.',
      nextSteps: 'Once accepted, we will onboard you with a brand voice questionnaire and a content approval workflow setup. Month 1 begins within 5 days of kickoff.',
      scopeItems: [
        { title: 'Monthly Strategy',      description: 'Content calendar for the month, theme planning, and hashtag research. Shared by the 28th of the previous month for approval.' },
        { title: 'Content Creation',      description: '12 posts per month (3/week): static graphics, carousels, and one Reel/short-form video per week. Copywriting included.' },
        { title: 'Scheduling & Posting',  description: 'All approved content scheduled and posted at optimal times using a scheduling tool. No manual effort required from your end.' },
        { title: 'Monthly Report',        description: 'End-of-month performance report covering reach, engagement rate, follower growth, and top-performing posts with insights.' },
      ],
      deliverables: [
        { item: 'Content calendar',    format: 'Google Sheet / Notion' },
        { item: '12 posts/month',      format: 'Instagram + LinkedIn' },
        { item: '4 Reels/short videos', format: 'MP4 (15–30 sec)' },
        { item: 'Monthly report',      format: 'PDF' },
      ],
      exclusions: ['Paid ad management', 'Influencer outreach', 'Photography or video production shoots', 'More than 2 revision rounds per post'],
      lineItems: [
        { description: 'Monthly Content Creation (12 posts + 4 Reels)', qty: 1, rate: 8000, gstRate: 18 },
        { description: 'Scheduling & Community Management',              qty: 1, rate: 2000, gstRate: 18 },
        { description: 'Strategy & Monthly Reporting',                   qty: 1, rate: 2000, gstRate: 18 },
      ],
      gstType: 'IGST',
      pricingNotes: 'This is a monthly retainer. Billed on the 1st of each month. Minimum commitment: 3 months.',
      paymentSchedule: [
        { milestone: 'Month 1 (advance)', amount: 12000, dueOn: 'On agreement signing' },
        { milestone: 'Month 2 onwards',   amount: 12000, dueOn: '1st of each month' },
      ],
      milestones: [
        { title: 'Onboarding',         duration: '2 days',   description: 'Brand voice questionnaire, content approval workflow setup' },
        { title: 'Content calendar',   duration: 'By 28th',  description: 'Next month\'s calendar shared for approval' },
        { title: 'Weekly posts',       duration: 'Weekly',   description: '3 posts + 1 Reel published per week' },
        { title: 'Monthly report',     duration: 'By 5th',   description: 'Previous month\'s performance review' },
      ],
      terms: `1. Minimum contract term: 3 months.\n2. 30-day written notice required to cancel.\n3. Client to provide brand assets (logo, product images) within 3 days of onboarding.\n4. Each post includes two rounds of revisions. Additional revisions at ₹500/post.\n5. Unused posts do not carry over to the next month.\n6. Client retains ownership of all published content.`,
    },
  },
]
