import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Permitir args/vars con prefijo _ (intencionalmente no usados) y
      // el patron de destructuring-para-omitir (const { x, ...rest } = obj
      // donde x se descarta a proposito).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // ── Reglas del React Compiler (eslint-plugin-react-hooks v6) ──
      // Estas 3 reglas estan pensadas para proyectos que usan el React
      // Compiler. Stockio NO lo usa (no esta en next.config). Disparan sobre
      // patrones idiomaticos y correctos de Next.js App Router:
      //   - set-state-in-effect: necesario para hidratar estado client-only
      //     (localStorage no existe en SSR) y para el patron clasico de
      //     data-fetching on mount (useEffect -> fetch -> setState).
      //   - purity: Date.now() durante el render para mostrar "dias restantes"
      //     de un trial. Calculo de solo-lectura, inofensivo.
      //   - immutability: falsos positivos sobre funciones declaradas en el
      //     componente que el compiler memoizaria.
      // Las revisamos una por una: ninguna era un bug real (ver commit).
      // Si algun dia adoptamos el React Compiler, se reactivan y se refactea.
      // El resto de reglas de react-hooks (rules-of-hooks, exhaustive-deps)
      // siguen ACTIVAS porque esas si atrapan bugs reales.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
