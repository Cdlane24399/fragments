import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'
import 'dotenv/config';
async function main() {
  await Template.build(template, 'nextjs-developer-dev', {
    cpuCount: 4,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);
