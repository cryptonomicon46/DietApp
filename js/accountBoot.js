// Imported first by app.js: on a device new to your account, your trackers load from the
// account before anything renders (see account.js).
import { accountBoot } from './account.js';

await accountBoot();
