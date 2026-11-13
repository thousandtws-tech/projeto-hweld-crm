import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { iniciarVitals } from './app/vitals';

iniciarVitals();
bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
