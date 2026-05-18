Return Runner
A two-sided marketplace application connecting customers who need packages returned to stores with local Runners who pick them up and drop them off.
Think Uber — but for package returns.
What It Does
Customers leave packages on their porch. Runners pick them up and return them to stores like Amazon dropoff locations, UPS Store, Kohl's, and Whole Foods. The platform handles matching, routing, payments, and verification automatically.
The Problem It Solves
Americans make over 3 million Amazon returns every day. Most sit in corners for weeks because nobody wants to make the trip. Return Runner eliminates that friction — picked up from your door.
Tech Stack
LayerTechnologyMobileReact Native via Expo (iOS + Android)NavigationExpo RouterBackendSupabase (PostgreSQL, Auth, Storage, Realtime)PaymentsStripe Connect (marketplace model)MapsGoogle Maps SDKNotificationsExpo Push NotificationsPhone MaskingTwilio Proxy APIState ManagementZustand
Architecture
Three interfaces, one backend:

Customer App — Post returns, track Runners in real time, tip and rate
Runner App — Go online, receive job pings, navigate to pickups and dropoffs
Admin Dashboard — Live map, transaction ledger, dispute resolution

Key Features
For Customers

Sign in with Amazon to auto-import recent orders
Upload or scan QR codes per package
Live Runner tracking (Uber-style)
Tip and rate after completion

For Runners

Go online/offline with one tap
Uber-style dispatch pings with full route preview before accepting
Smart batch detection — apartment buildings grouped automatically
Geofenced QR unlock at dropoff location
Slide-to-confirm gestures at each step

For the Platform

25% take rate on base fare
Runners keep 100% of tips
Twilio proxy masks phone numbers for both parties
Stripe Connect handles three-way payment splitting automatically

Pricing Model

$3.85 flat per package
$1.00 per mile (customer door to dropoff location)
Platform keeps 25% of base fare
Runner earns 75% of base fare + 100% of tips

Database Schema
Six core tables: users, jobs, packages, ratings, runner_locations, job_declines
Full schema with Row Level Security in /supabase/migrations
Project Status
Active development. Phase 1 (foundation + database) and Phase 2 (auth screens) complete. Phase 3 (customer return funnel) in progress.
Built By
Antonio Planzo — St. Petersburg, FL
Architected and directed using Claude API and Claude Code.
