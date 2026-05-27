Here is the project description prepared in English, directly aligning your course platform concept with the certification criteria.

# Product Requirements Document (PRD): Next-Gen Course & Community Platform

**Project Overview**
The application is a comprehensive educational platform that merges the structured learning environment of Coursera with the active community engagement features of Circle. Users gain access to high-quality video and markdown-based learning materials while seamlessly interacting with peers through Discord-style chat channels.

**Core Features (MVP Scope)**

- **Authentication:** Users are required to create an account and log in to interact with the platform.
- **Monetization & Paywall:** Access is managed on a per-course basis, requiring users to pass a payment gateway to unlock specific course materials and associated community channels.
- **Test Environment:** A built-in free tier or test mode where the paywall is bypassed, allowing users to experience the platform and course content at no cost.
- **Rich Content Delivery:** Educational modules support embedded video materials and text content formatted via markdown.
- **Integrated Community:** Dedicated text groups and chat channels attached to specific courses to foster real-time discussion.

---

## 10xBuilder Certification Alignment

To ensure this project fulfills the mandatory requirements for the 10xBuilder certification block, the architecture includes the following elements:

- **Access Control:** A robust login screen and session management system suitable for a web application.
- **Data Management (CRUD):** Sensible domain operations allowing users to read course materials, create chat messages, update their profiles, and delete their own posts.
- **Business Logic:** Core application logic dictating access rights, paywall validation, and the routing between free-tier and premium content.
- **Contextual Documentation:** The project repository will maintain up-to-date architecture files, specifically `prd.md`, `infrastructure.md`, and `roadmap.md`.
- **Testing:** Implementation of at least one comprehensive test that verifies the application's functionality strictly from the user's perspective.
- **CI/CD Pipeline:** Automated workflows to continuously build the application and verify code quality.

---

## Technical Architecture & Strategy

- **Technology Stack:** The web application will be built using React and Next.js to ensure a highly responsive, modern frontend with seamless data fetching capabilities.
- **MVP Prioritization:** The initial development phase will focus strictly on the shortest path to a working flow, avoiding scope creep like adding AI coaches or complex budget charts that exceed the bounds of a course project.
- **AI-Assisted Development:** The workflow will leverage advanced tools such as Claude Code and Cursor to accelerate the generation of boilerplate code, tests, and context documentation.
