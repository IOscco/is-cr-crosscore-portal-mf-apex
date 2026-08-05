import './dev-portalti-shared-shim';
import { createApp, h } from 'vue';
import singleSpaVue from 'single-spa-vue';
import { createPinia } from 'pinia';
import { createIsUiKitPlugin } from 'is-uikit-components-vue';
import 'is-uikit-components-vue/style.css';
import 'primeicons/primeicons.css';
import AppRoot from './App.vue';
import AppDatePicker from './components/shared/AppDatePicker.vue';
import AppMonthPicker from './components/shared/AppMonthPicker.vue';
import router from './router';

const lifecycles = singleSpaVue({
  createApp,
  appOptions: {
    render() {
      return h(AppRoot);
    },
  },
  handleInstance: (app) => {
    app.use(createPinia());
    app.use(createIsUiKitPlugin());
    app.use(router);
    app.component('AppDatePicker', AppDatePicker);
    app.component('AppMonthPicker', AppMonthPicker);
  },
});

export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;
