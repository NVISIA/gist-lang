#!/usr/bin/env node
import { Command } from 'commander';
import { registerCheckCommand } from './commands/check.js';
import { registerInitCommand } from './commands/init.js';
import { registerSkillsCommand } from './commands/skills.js';
import { registerBundleCommand } from './commands/bundle.js';

const program = new Command();

program
  .name('gist')
  .description('GIST — Generative Intent Specification Toolkit')
  .version('0.1.0');

registerCheckCommand(program);
registerInitCommand(program);
registerSkillsCommand(program);
registerBundleCommand(program);

program.parse();
