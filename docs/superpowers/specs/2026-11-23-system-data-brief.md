# System Data Cleaning — Product Brief (2026-11-23)

Verbatim product brief from the project owner. The implementation plan at
`docs/superpowers/plans/2026-11-23-system-data-engine.md` argues from this document.

---

System Data is the single largest and most misunderstood storage category on macOS. It can swell beyond 250GB on a single machine, and it is invisible to the user. It hides in caches, logs, local snapshots, old backups, developer artifacts, and AI model files that macOS accumulates in the background.

Most cleaning tools either ignore System Data entirely because it is too risky, or they attack it recklessly and risk damaging the user's machine. This is the gap. If Bizzi Mac Cleaner can become the definitive, safest, and most effective System Data cleaner on macOS, it will own the most painful problem in the category.

We need to build a deep, documented understanding of System Data across all supported macOS versions, and translate that expertise into a cleaning engine that is safer than any competitor and more effective than any competitor.

## A. Understand the Full Taxonomy of System Data
We must map every component that falls under "System Data" and classify it by safety level.

## B. Become Experts on the Risk Boundaries
The most valuable expertise is knowing where the line is.

## C. Translate Expertise into a Best-in-Class Cleaning Engine
The expertise must be reflected in the tool itself.

## 3. The Quality Standard – "Absurdly Good" Means Expert-Grade
- **Safety above all else:** the tool should be known as the one that has never broken a Mac.
- **Transparency:** the user must always know exactly what is being removed, why it is safe, and how much space it will reclaim.
- **Depth of knowledge:** clean areas competitors avoid (developer artifacts, AI model caches, local snapshots) — but safely.
- **Documentation as a product:** the expertise must be codified in clear, accurate documentation.

## 4. Key Principles
- **Expertise over aggression:** better to leave 10GB on the table than delete one file that breaks the system.
- **Version awareness:** what is safe on Sonoma may differ on Tahoe. The tool must know the difference.
- **User trust:** the safety model must be visible and defensible.
- **Competitive differentiation:** become the reference for "how to clean System Data safely on macOS".

## 5. Success Criteria
- A complete System Data taxonomy: every component documented with location, purpose, safety rating, impact.
- A documented safety model: the tool can explain, for every target, why it is safe or unsafe to delete.
- Expert coverage of high-value targets: caches, logs, snapshots, iOS backups, developer artifacts.
- No dangerous deletions: never touches core system files, kernel extensions, or system libraries.
- Version-aware behavior: the engine adapts to the macOS version it runs on.
- Trusted positioning: safest and most expert System Data cleaner on macOS.
