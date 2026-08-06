# Tests end-to-end

Tests de Playwright que manejan la app en un browser real.

---

## ⚠️ LEER ESTO ANTES DE CORRERLOS

**Estos tests le pegan a la base de Supabase REAL, la misma que usa la app.**

No hay base de test. Crean turnos, los borran y usan la sesión del dueño de
verdad. Si tu `.env` apunta a producción, estás escribiendo en producción.

Por eso:

- **No están en el CI.** Correrlos en cada push sería escribir en producción
  automáticamente. Ver el comentario al final de `.github/workflows/ci.yml`.
- **Antes de agregar un test que escriba, pensá qué pasa si el dato que toca ya
  existe o es de otro.** Ya nos mordió — ver *Lecciones* abajo.

---

## Cómo correrlos

**La primera vez**, después de clonar o de un `npm ci`, hay que bajar el
browser. Playwright no lo trae en el paquete de npm:

```bash
npx playwright install chromium
```

Si te salta `browserType.launch: Executable doesn't exist`, es esto.

Después, tres pasos en este orden:

```bash
# 1. La app tiene que estar levantada en :3000
npm run dev

# 2. Generar la cookie de sesión del dueño (en otra terminal)
npm run test:auth -- tu-email-de-dueño@gmail.com

# 3. Correr la suite
npm run test:e2e
```

Un solo archivo:

```bash
npx playwright test --config e2e-local/playwright.config.ts e2e-local/polling.spec.ts
```

> **El `playwright.config.ts` vive acá adentro, no en la raíz.** Por eso todos
> los comandos llevan `--config e2e-local/playwright.config.ts`. Si corrés
> `npx playwright test` a secas, no encuentra nada.

---

## Qué cubre cada spec

| Archivo | Qué prueba |
|---|---|
| `tasks.spec.ts` | Guard del onboarding (usuario con negocio → `/panel`) y agregar franja horaria en Config |
| `polling.spec.ts` | Un turno nuevo aparece solo en el panel, sin recargar |
| `polling-otro-dia.spec.ts` | Lo mismo, pero parado en un día que no es hoy |
| `reschedule.spec.ts` | Mover un turno a otro horario desde el panel |
| `shots.spec.ts` | Screenshots a 360px (genera `shots/`, no assert) |

Y dos scripts que no son specs:

| Archivo | Para qué |
|---|---|
| `gen-auth.mjs` | Genera `.auth.json`, la cookie de sesión que usan los specs |
| `audit-rls.mjs` | Auditoría de aislamiento multi-tenant: crea un negocio B con otro dueño y verifica que no pueda leer ni escribir nada del negocio A. Corré `node --env-file=.env e2e-local/audit-rls.mjs` |

---

## Qué NO se sube (y por qué)

Ver `.gitignore` de esta carpeta:

- **`.auth.json`** — es una credencial. Con eso entrás al panel como el dueño.
- **`shots/`** — los screenshots del panel muestran **nombres y teléfonos de
  clientes reales**. Es PII.
- **`test-results/`** — los snapshots de DOM que guarda Playwright al fallar
  también tienen PII.

Los specs **sí** van al repo: son código, tienen que evolucionar con la app.

---

## Lecciones (leer antes de tocar un spec)

**1. La sesión caduca en 1 hora.**
Si la suite falla **entera**, incluso specs que casi no tocan lógica, mirá el log
del dev server. Si ves `GET /login 200`, es el JWT vencido, no tu código.
Regenerá con `npm run test:auth -- <email>`.

**2. No hardcodees fecha ni horario.**
Hay un índice único (`appointments_slot_unique`) por negocio + fecha + hora.
`reschedule.spec.ts` insertaba fijo en "hoy 12:00" y reventaba en cuanto alguien
reservaba ese horario probando la app. Buscá un slot libre o usá un día vacío.

**3. Chequeá el error de los inserts.**
Ese mismo spec hacía `data!.id` sin mirar `error`, así que el fallo aparecía como
un `TypeError: Cannot read properties of null` dos líneas después, sin decir qué
había pasado. Tirá un error con contexto.

**4. Asegurate de que el test toque SOLO lo suyo. Esta es la importante.**
El botón "Mover a otro horario" existe **solo en la tarjeta del turno actual**
(el primer confirmado del día). `reschedule.spec.ts` hacía
`getByText("Mover a otro horario").click()` asumiendo que era el suyo — y cuando
el día tenía otros turnos, **movía uno ajeno**. Modificó datos reales sin que
nadie se enterara.

Ahora crea su turno en un **día futuro vacío**, donde es el único, y además
verifica que haya exactamente un botón antes de tocarlo.

> **Cómo comprobar que un spec no toca nada ajeno:** snapshot de la tabla antes,
> corrés, snapshot después, diff por `id`. Si cambió algo que no creó el test,
> el test está mal.
