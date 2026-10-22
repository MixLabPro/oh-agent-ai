# Regenerate public/llms-full.txt from the English docs (strips HTML comments, absolutizes links).
# Run after all TBD items are resolved; in the real repo, port this to a build step.
import re
root='src/content/docs'
order=['index','city-guide','data-sources/claude-code','data-sources/codex','data-sources/deepseek-harness','data-sources/workbuddy','privacy-and-data','install',
       'vitals/overview','vitals/cli','vitals/mcp-tools','vitals/app-sdk','vitals/python',
       'architecture/overview','architecture/data-pipeline','architecture/city-model',
       'integrations/index','integrations/custom-sources-and-manifests','integrations/skill-auditor',
       'contributing/adding-a-data-source']
out=["# Oh Agent — full documentation (plain text)","","Source: https://ohagent.ai/docs · Generated from the docs Markdown. Version described: 1.0.0-beta.2 (no public installer yet).",""]
for o in order:
    s=open(f'{root}/{o}.md').read()
    _,fm,body=s.split('---',2)
    title=re.search(r'^title: (.*)$',fm,re.M).group(1)
    body=re.sub(r'<!--.*?-->','',body,flags=re.S)
    body=re.sub(r':::caution\[(.*?)\]\n',r'**\1:** ',body).replace(':::\n','')
    body=re.sub(r'\]\((/[^)]*)\)',r'](https://ohagent.ai\1)',body)
    body=re.sub(r'\n{3,}','\n\n',body).strip()
    slug=re.sub(r'(^|/)index$','',o)
    url='https://ohagent.ai/docs'+('/'+slug if slug else '')
    out+=["---","",f"# {title}",f"URL: {url}","",body,""]
open('public/llms-full.txt','w').write("\n".join(out))
