// Torsor frontend kernel: the stable contribution + theme contract that the shell and
// plugins build on. Importing this barrel registers the built-in (first-party)
// contributions exactly once.
import './builtins';

export * from './contributions';
export { contributions } from './contributions';
export * from './theme';
