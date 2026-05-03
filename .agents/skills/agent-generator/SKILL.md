---
name: agent-generator
description: Create specialized agents with skill files, tool configurations, and comprehensive documentation. Use this skill when the user asks to create a new agent, build an agent for a specific task, or generate agent scaffolding. Generates well-structured agents following best practices.
---

This skill generates specialized agents with complete skill files, tool configurations, and documentation. Follow this workflow to create production-ready agents.

## Agent Creation Workflow

### 1. Analyze Requirements

Before creating, understand:
- **Purpose**: What task should the agent handle?
- **Domain**: Programming, design, debugging, refactoring, documentation?
- **Tools needed**: Which tools does this agent require?
- **Context**: What codebase patterns should it follow?

### 2. Design Agent Structure

Each agent needs:
```
.agents/
└── skills/
    └── {skill-name}/
        ├── SKILL.md          # Core skill definition
        ├── LICENSE.txt       # License (optional)
        └── resources/        # Additional resources (optional)
```

### 3. Create SKILL.md

The SKILL.md file structure:

```markdown
---
name: {skill-name}
description: Clear description of when to use this agent (trigger phrases)
---

# Skill Name

## Purpose
What this skill does and when to use it.

## Workflow
Step-by-step instructions for the agent.

## Guidelines
- Do this
- Don't do that
- Important considerations

## Tools Reference
| Tool | When to use |
|------|-------------|
| tool_name | specific use case |
```

### 4. Design Principles

**Good Agent Descriptions:**
- Start with action verbs: "Create...", "Debug...", "Analyze..."
- Include trigger phrases: "when user asks to...", "when the user mentions..."
- Be specific about scope: "for Vue 3", "for CSS", "for debugging"

**Skill File Content:**
- Clear purpose statement
- Step-by-step workflow
- Do's and Don'ts
- Tool usage guidelines
- Examples of inputs/outputs

### 5. Generate Agent

When creating an agent:

1. **Create folder structure**:
   ```bash
   mkdir -p .agents/skills/{skill-name}
   ```

2. **Write SKILL.md** with:
   - YAML frontmatter (name, description)
   - Purpose section
   - Workflow/Steps
   - Guidelines (Do/Don't)
   - Tools reference table
   - Examples

3. **Add LICENSE.txt** if needed (see frontend-design skill for template)

### 6. Integrate into Project

After creating the agent:
1. Add to `.agents/skills/00_INDEX.md` (if exists)
2. Update `AGENTS.md` if referenced there
3. Document in project docs

## Template: SKILL.md

```markdown
---
name: {name}
description: {when to use this agent}
---

# {Skill Title}

## Purpose
[What this skill accomplishes]

## When to Use
- [Trigger scenario 1]
- [Trigger scenario 2]
- [Trigger scenario 3]

## Workflow

### Step 1: [Name]
[Description]

### Step 2: [Name]
[Description]

### Step 3: [Name]
[Description]

## Guidelines

### Do
- [Positive guideline]
- [Positive guideline]

### Don't
- [Negative guideline]
- [Negative guideline]

## Tools Reference

| Tool | Purpose | Example |
|------|---------|---------|
| [tool] | [what it does] | [how to use] |

## Examples

### Example 1: [Title]
**Input:** 
[What user provides]

**Output:**
[What agent produces]
```

## Example: Creating a GitNexus-style Agent

When creating a code intelligence agent like GitNexus:

```markdown
---
name: code-intelligence
description: Analyze code, trace execution flows, and understand symbol relationships. Use when exploring unfamiliar code, finding callers/callees, or mapping dependencies.
---

# Code Intelligence Agent

## Purpose
Provides deep code analysis using symbol graphs, execution traces, and relationship mapping.

## Workflow

1. **Understand Request** - What does user want to know about the code?
2. **Analyze Symbol** - Use gitnexus_context for full picture
3. **Assess Impact** - Use gitnexus_impact for blast radius
4. **Report Findings** - Summarize with risk levels and affected areas
```

## Integration Checklist

- [ ] Folder structure created
- [ ] SKILL.md written with frontmatter
- [ ] Description includes trigger phrases
- [ ] Workflow is step-by-step
- [ ] Tools reference table included
- [ ] Examples provided
- [ ] Integrated into project index
