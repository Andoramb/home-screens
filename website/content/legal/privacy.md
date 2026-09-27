---
title: Privacy Policy
description: What Home Screens keeps on your hub, what the Google sign-in and our small anonymous usage report involve, and what the homescreens.dev website collects.
effective: '2026-09-27'
layout: legal
nextjs:
  metadata:
    title: Privacy Policy
    description: What Home Screens keeps on your hub, what the Google sign-in and our small anonymous usage report involve, and what the homescreens.dev website collects.
    alternates:
      canonical: /privacy
---

Home Screens is free, open-source software for a wall display you run at home, made by the Home Screens project ("we"). This policy covers the Home Screens software, the sign-in helper at auth.homescreens.dev, and the homescreens.dev website.

## The short version

- Your calendars, photos, chores, lists and settings live on your own Home Screens hub, in your home. We never receive them.
- If you connect Google, your Google data goes only to your hub. We don't store it, sell it, show ads with it, or use it to train AI.
- Once a day, your hub sends us a small anonymous report about how the app is set up (never what's in it). You can turn this off.
- Our website uses Google Analytics to count visits.

## 1. What stays on your hub

Everything you put into Home Screens is saved in the `data` folder on the computer that runs it (usually a Raspberry Pi). That includes your layouts, settings, family members, chores, meal plans, lists, timers, photos, and the keys and sign-ins for services you connect. We have no copy. Anyone who can use your hub can see it, so set a password in Settings if other people share your home network.

## 2. Services you connect yourself

When you connect a service (a weather provider, an iCloud or other calendar, Immich, Unsplash, OneDrive and so on), your hub talks to that service directly, using keys you entered. Those services' own privacy policies apply to what they receive.

## 3. Google Calendar and Google Photos

When you sign in with Google, Home Screens asks for only what it needs:

- **Google Calendar** (read only): the names and colors of your calendars and the events on the ones you choose, so your display can show them.
- **Google Photos** (read only, only the photos you pick): when you choose photos in Google's photo picker, your hub downloads copies of those photos into your Home Screens photo library so your display can show them. Home Screens can't see any other photos in your account.

**Where it goes.** Calendar events and photos go straight from Google to your hub. They are kept on your hub and nowhere else.

**Signing in.** Home Screens' app passwords stay on our sign-in helper at auth.homescreens.dev, so they never ship inside the software. For Google Calendar, your hub asks Google for a short code itself; once you've typed it, your hub collects its sign-in keys through the helper. For Google Photos, Google gives your hub a short-lived code, and your hub trades that code for sign-in keys through the helper. Either way, the helper adds Home Screens' app password and passes the request straight to Google. It does the same when the keys need renewing, about once an hour. It does not store or log the codes or keys, and it never sees your calendar events or photos. To block abuse it counts requests per network address for one minute, and keeps nothing after that. If you connect Google with your own Google app instead, your hub talks to Google directly and the helper isn't involved.

**What we never do.** We don't sell Google data, use it for ads, share it with anyone, or use it to develop, improve or train AI or machine learning models. No person at Home Screens can read it, because it never reaches us.

Home Screens' use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**Disconnecting.** In Home Screens, choose **Disconnect** under Google Calendar in Settings, or **Disconnect Google Photos** next to Import from Google Photos. That removes the sign-in from your hub and asks Google to cancel it. You can also remove Home Screens at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Photos you already imported stay in your photo library until you delete them there.

## 4. Anonymous usage report

Once a day, your hub sends a small report to our server so we know which features people use. It contains:

- a random install ID made on your hub (not linked to you)
- the app version and the kind of computer (operating system, processor type)
- display sizes and orientation
- how many screens, modules and profiles you have, and which module types
- which weather provider and screen transition you picked
- whether sleep, alerts, a password and calendar connections are turned on
- installed plugins from the plugin marketplace (other plugins are counted but never named)

It never includes names, places, addresses, calendar events, photos, keys, or anything you typed. Our server does not record your IP address. We keep only the latest report from each install, and delete it 12 months after your hub last sent one. We do keep running totals, like how many installs started on each day, but they hold no install ID and can't be traced to any hub.

To turn it off, open Settings, then Status, and switch off **Send anonymous usage data**. That stops new reports. The same card shows your install ID, and you can email us to have that ID's report deleted right away.

## 5. Updates and plugins

To check for updates and list plugins, your hub fetches public files from GitHub. GitHub sees your hub's IP address, as with any website visit; its privacy policy applies.

## 6. The homescreens.dev website

The website uses Google Analytics to count page visits and see which pages help. Google Analytics uses cookies and receives your browser's usual details (like browser type and approximate location). It keeps detailed visit records for 2 months and information tied to your browser for 14 months; after that, only totals remain. The Google sign-in return page at homescreens.dev/connect/google removes the sign-in code from the address and never sends it to Analytics. The website has no accounts and no forms.

## 7. Children

Families use Home Screens, kids included. The chore chart and the phone remote don't create accounts with us, and anything a child enters stays on the family's hub. We don't knowingly collect personal information from anyone, children included.

## 8. Changes

If this policy changes, we'll update it here and change the date at the top. Big changes will also be noted in the release notes.

## 9. Contact

Questions or deletion requests: [hello@homescreens.dev](mailto:hello@homescreens.dev).
