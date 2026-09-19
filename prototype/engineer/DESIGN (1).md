---
name: Industrial Service Core
colors:
  surface: '#faf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#faf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e8'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#3d4a3d'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#6c7b6c'
  outline-variant: '#bbcbba'
  surface-tint: '#006d33'
  primary: '#006d33'
  on-primary: '#ffffff'
  primary-container: '#07c160'
  on-primary-container: '#00471f'
  inverse-primary: '#45e17c'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#4a5e87'
  on-tertiary: '#ffffff'
  tertiary-container: '#94a8d6'
  on-tertiary-container: '#283d64'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#66ff95'
  primary-fixed-dim: '#45e17c'
  on-primary-fixed: '#00210b'
  on-primary-fixed-variant: '#005225'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#b2c6f6'
  on-tertiary-fixed: '#011a40'
  on-tertiary-fixed-variant: '#32466e'
  background: '#faf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
  section-gap: 32px
---

## Brand & Style

This design system is engineered for high-utility industrial environments and service management. It prioritizes clarity, efficiency, and high-legibility to support field technicians and corporate administrators alike. 

The aesthetic is **Industrial Minimalism**: a blend of clean, high-end professional interfaces (reminiscent of premium WeChat Mini Programs) with the structural rigor required for data-heavy workflows. The UI is built on a foundation of ample whitespace, structured grids, and high-contrast elements to ensure accessibility under varying lighting conditions, specifically outdoors or in high-glare service environments. 

The emotional response should be one of **reliability, precision, and institutional trust.**

## Colors

The palette is optimized for high-contrast visibility. 

*   **Primary (#07c160):** Used exclusively for primary actions, success states, and critical brand touchpoints. This specific green offers high recognition and implies "go" or "complete" in a service context.
*   **Surface & Container:** The background uses pure white (`#FFFFFF`) to maximize contrast, while the surface-container (`#F7F7F7`) provides subtle grouping for logical sections without introducing visual noise.
*   **On-Surface (#1A1A1A):** A near-black neutral ensures maximum text legibility (WCAG AAA compliant) for technical documentation and instructions.
*   **Secondary (#576B95):** A deep blue-grey used for links and secondary interactive elements, providing a professional "service" feel that distinguishes non-primary actions from brand-critical ones.

## Typography

This design system utilizes **Inter** for its systematic, utilitarian nature and exceptional legibility at small sizes. 

*   **Hierarchy:** Headlines use semi-bold or bold weights with tighter letter-spacing to feel "industrial" and authoritative. 
*   **Readability:** Body text maintains a standard 1.5x line-height ratio to ensure long-form service manuals or data logs remain readable.
*   **Labels:** Labels use slightly increased letter spacing and medium/semibold weights to differentiate them from body content, particularly in data-entry forms.

## Layout & Spacing

The layout philosophy follows a **Fixed-Fluid hybrid** model. On mobile, it utilizes a 4-column grid with 16px margins; on desktop, it expands to a 12-column grid with a maximum content width of 1280px.

*   **Rhythm:** Spacing is strictly based on a 4px baseline grid. 
*   **Sectioning:** Large vertical gaps (32px+) are used to separate distinct service phases or data modules.
*   **Density:** For mobile service apps, touch targets are prioritized at a minimum height of 44px, even when the visual element appears smaller.

## Elevation & Depth

To maintain the high-end industrial aesthetic, this design system avoids heavy shadows. Instead, it utilizes **Tonal Layering** and **Subtle Outlines**:

1.  **Level 0 (Base):** `#FFFFFF` - The main canvas.
2.  **Level 1 (Cards/Containers):** `#FFFFFF` with a 1px solid border of `#E0E0E0`. No shadow.
3.  **Level 2 (Modals/Popovers):** `#FFFFFF` with a very soft, diffused shadow (0px 4px 12px rgba(0,0,0,0.05)) to distinguish overlay content without appearing "heavy".

Interactive elements use slight background color shifts (e.g., `#F7F7F7`) on hover or press rather than increasing elevation.

## Shapes

The shape language is "Standard Professional." A base radius of **8px** (Level 2: Rounded) is applied to all primary UI components (buttons, input fields, cards). 

*   **Standard (8px):** Primary buttons, cards, and input fields.
*   **Large (16px):** Bottom sheets and large modal containers.
*   **Pill:** Used exclusively for status "Chips" (e.g., "In Progress", "Completed") to differentiate status-indicators from action-buttons.

## Components

### Buttons
*   **Primary:** Solid `#07c160` background with `#FFFFFF` text. 8px radius.
*   **Secondary:** White background with `#1A1A1A` 1px border. 
*   **Ghost:** No border or background, using `#576B95` for text. Used for "Cancel" or less frequent actions.

### Input Fields
*   **Style:** Outlined style using `#E0E0E0`. On focus, the border shifts to 2px solid `#07c160`.
*   **Labels:** Always visible above the input field in `label-md` style for permanent context during field data entry.

### Chips & Badges
*   **Status Badges:** Use a light tint of the status color (e.g., 10% opacity green) with a bold colored text for high scannability.
*   **Filter Chips:** Outlined with 8px radius; when active, background fills with `#1A1A1A` and text turns white.

### Lists & Tables
*   Data rows should be separated by a 1px `#E0E0E0` divider. 
*   Row height is set to 56px for mobile to ensure easy tapping in industrial settings.

### Cards
*   Cards use the Level 1 Elevation: White background, `#E0E0E0` border, 8px radius.
*   No shadows are used for cards to keep the interface looking "flat" and professional.