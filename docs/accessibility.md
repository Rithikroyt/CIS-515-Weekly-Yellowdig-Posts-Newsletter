# Accessibility

What is implemented:

- **Structure:** a skip link, one `h1` per page, sections labelled by their headings, `nav` landmarks for the main menu, weeks and issue sections.
- **Keyboard:** every control is a link, button or native form control. Atlas nodes are focusable (`tabIndex=0`, `role="button"`, Enter or Space to highlight a path, Escape to clear). There is a visible 3px focus ring.
- **Touch:** buttons, nav links, selects and summaries are at least 44px tall.
- **Colour:** state is never conveyed by colour alone. Badges carry text, and week nodes add a dashed border for reference issues and a text label for every state. Gold is used as a fill behind dark text, not as text on white.
- **Charts:** every bar chart and trend chart has a visually hidden table. Each workflow graph has a full text version ("Text version of this workflow").
- **Live status:** "Link copied" and the Explore result count use `role="status"`.
- **Images:** decorative SVGs are `aria-hidden`; the pipeline figure has a title and description; screenshots use the issue's alt text.
- **Downloads:** link text names the week and file type, for example "Download HTML (Week 2)".
- **Motion:** honours `prefers-reduced-motion`.
- **Newsletter:** semantic headings and tables, readable without CSS, and print styles.

Not yet done: an audit with a real screen reader (NVDA or VoiceOver) and automated axe checks. These are recommended before public launch.
