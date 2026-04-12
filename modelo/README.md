# Score Guardians — Modelo Liga MX
Modelo de predicción de resultados de la Liga MX basado en **Red Neuronal + Distribución de Poisson**.

## Métricas del modelo
| Indicador | Valor |
|-----------|-------|
| Total de partidos | 1495 |
| Precisión en prueba | 45.33% |
| Alpha óptimo (NN) | 0.55 |
| Torneos analizados | Apertura 2021 → Clausura 2026 |

## Archivos
- `modelos/red_neuronal.keras` — Red Neuronal entrenada (TensorFlow/Keras)
- `modelos/modelo_poisson.pkl` — Modelo Poisson Dixon-Coles
- `modelos/config.json` — Configuración del modelo híbrido
- `datos/ligamx_partidos.csv` — Dataset de 1495 partidos reales
- `datos/ranking_equipos.csv` — Ranking por poder de ataque/defensa

## Universidad Tres Culturas | Score Guardians
