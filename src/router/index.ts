import { createRouter, createWebHistory } from 'vue-router';
import { APEX_ROUTER_BASE_PATH } from '../constants/apex-router-base';
import { createAuthorizationMiddleware } from '../middleware/authorization';
import AppShellLayout from '../components/layout/AppShellLayout.vue';
import IncidentesLayout from '../views/incidentes/IncidentesLayout.vue';
import IncidentesDashboardView from '../views/incidentes/IncidentesDashboardView.vue';
import IncidentesGrupoView from '../views/incidentes/IncidentesGrupoView.vue';
import IniciativasListView from '../views/iniciativas/IniciativasListView.vue';
import IniciativaDetailView from '../views/iniciativas/IniciativaDetailView.vue';
import IniciativasPapeleraView from '../views/iniciativas/IniciativasPapeleraView.vue';
import ProyectosListView from '../views/proyectos/ProyectosListView.vue';
import ProyectoDetailView from '../views/proyectos/ProyectoDetailView.vue';
import ProyectosPapeleraView from '../views/proyectos/ProyectosPapeleraView.vue';
import ConfigLayout from '../views/config/ConfigLayout.vue';
import ConfigMantenedorView from '../views/config/ConfigMantenedorView.vue';
import ConfigAuditoriaLogsView from '../views/config/ConfigAuditoriaLogsView.vue';
import SquadsPlaceholderView from '../views/config/SquadsPlaceholderView.vue';

const BASE_PATH = APEX_ROUTER_BASE_PATH;

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: BASE_PATH,
      alias: `${BASE_PATH}/`,
      component: AppShellLayout,
      redirect: `${BASE_PATH}/proyectos`,
      children: [
        { path: 'dashboard', redirect: { name: 'proyectos' } },
        {
          path: 'iniciativas/papelera',
          name: 'iniciativas-papelera',
          component: IniciativasPapeleraView,
        },
        {
          path: 'iniciativas',
          name: 'iniciativas',
          component: IniciativasListView,
        },
        {
          path: 'iniciativas/:id',
          name: 'iniciativa-detail',
          component: IniciativaDetailView,
        },
        {
          path: 'incidentes',
          component: IncidentesLayout,
          redirect: { name: 'incidentes-dashboard' },
          children: [
            {
              path: 'dashboard',
              name: 'incidentes-dashboard',
              component: IncidentesDashboardView,
            },
            {
              path: 'g1',
              name: 'incidentes-g1',
              component: IncidentesGrupoView,
              meta: {
                title: 'G1 · Ratificación',
                hint: 'Tickets en validación analista dentro del universo asignado a tribus de desarrollo.',
              },
            },
            {
              path: 'g2',
              name: 'incidentes-g2',
              component: IncidentesGrupoView,
              meta: {
                title: 'G2 · Desarrollo',
                hint: 'Tickets en desarrollo activo ya asignados a squads y TPO de tribus.',
              },
            },
            {
              path: 'g3',
              name: 'incidentes-g3',
              component: IncidentesGrupoView,
              meta: {
                title: 'G3 · Resueltos',
                hint: 'Cerrados o rechazados pertenecientes a tribus de desarrollo. La alerta de antigüedad no aplica en esta bandeja.',
              },
            },
            {
              path: 'otros',
              name: 'incidentes-otros',
              component: IncidentesGrupoView,
              meta: {
                title: 'Otros',
                hint: 'Tickets de tribus de desarrollo que no entran en G1, G2 o G3 con la clasificación actual.',
              },
            },
            {
              path: 'soporte',
              name: 'incidentes-soporte',
              component: IncidentesGrupoView,
              meta: {
                title: 'Soporte al Negocio',
                hint: 'Consolidado general de tickets atendidos por el equipo de Soporte al Negocio. Esta bandeja no forma parte del total operativo de tribus.',
              },
            },
            {
              path: 'sin-squad',
              name: 'incidentes-sin-squad',
              component: IncidentesGrupoView,
              meta: {
                title: 'Pendientes de clasificación',
                hint: 'Incidentes sin match con squads de desarrollo y sin marca de Soporte al Negocio. No se contabilizan dentro del total operativo de tribus.',
              },
            },
          ],
        },
        {
          path: 'proyectos/papelera',
          name: 'proyectos-papelera',
          component: ProyectosPapeleraView,
        },
        {
          path: 'proyectos',
          name: 'proyectos',
          component: ProyectosListView,
        },
        {
          path: 'proyectos/:id',
          name: 'proyecto-detail',
          component: ProyectoDetailView,
        },
        {
          path: 'config',
          component: ConfigLayout,
          redirect: `${BASE_PATH}/config/mantenedor`,
          children: [
            { path: 'mantenedor', name: 'config-mantenedor', component: ConfigMantenedorView },
            {
              path: 'auditoria/proyectos-eliminados',
              name: 'config-auditoria-proyectos',
              redirect: { name: 'config-auditoria-logs' },
            },
            {
              path: 'auditoria/logs',
              name: 'config-auditoria-logs',
              component: ConfigAuditoriaLogsView,
            },
            { path: 'squads', name: 'config-squads', component: SquadsPlaceholderView },
          ],
        },
      ],
    },
  ],
});

router.beforeEach(createAuthorizationMiddleware(router));

export default router;
