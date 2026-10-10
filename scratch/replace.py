import os
import glob

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace('vendor/z-runtime/packages/', 'packages/runtime/')
    new_content = new_content.replace('vendor/z-runtime/apps/cli', 'packages/runtime/host-cli')
    new_content = new_content.replace('vendor/z-runtime/vendor/', 'packages/runtime/cordis/')
    new_content = new_content.replace('vendor/z-runtime', 'packages/runtime')
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {path}")

for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or 'dist' in root or 'release' in root or 'packages/runtime/' in root:
        continue
    for file in files:
        if file.endswith(('.mjs', '.cjs', '.js', '.ts', '.json', '.yml', '.yaml', '.sh', '.md')):
            process_file(os.path.join(root, file))

# Also run on packages/runtime files
for root, dirs, files in os.walk('packages/runtime'):
    if 'node_modules' in root or '.git' in root or 'dist' in root or 'release' in root:
        continue
    for file in files:
        if file.endswith(('.mjs', '.cjs', '.js', '.ts', '.json', '.yml', '.yaml', '.sh', '.md')):
            process_file(os.path.join(root, file))

