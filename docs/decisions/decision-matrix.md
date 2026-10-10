# Decision Matrix

## Criteria and weighted scores

Proposed assessment for a small dashboard with regular data refresh and Docker deployment. Experience scores assume greater familiarity with JavaScript and React; they are not collected team ratings. Criteria and weights are fixed before scoring. Backend and frontend options are ranked separately.

Scores: 1 = poor fit, 5 = excellent fit. Weights: 1 = nice to have, 2 = important, 3 = critical.

| Criterion | Weight | JavaScript (Node.js) | Python | Java | React | Vue.js | Angular |
|---|---:|---:|---:|---:|---:|---:|---:|
| Existing team experience | 3 | 4 | 3 | 2 | 4 | 3 | 2 |
| Packages and integrations | 3 | 5 | 5 | 4 | 5 | 4 | 4 |
| Real-time data refresh | 3 | 5 | 3 | 4 | 5 | 5 | 5 |
| Docker deployment simplicity | 2 | 5 | 5 | 3 | 5 | 5 | 5 |
| Community and long-term viability | 2 | 5 | 5 | 5 | 5 | 4 | 5 |
| Learning value | 1 | 4 | 4 | 4 | 4 | 4 | 4 |
| **Weighted total** | | **66** | **57** | **50** | **66** | **58** | **57** |

Weighted total = sum of (criterion weight × option score). Maximum: 70.
Recommended selection: JavaScript (Node.js) and React.

## Recommendation

I recommend JavaScript with Node.js for the backend and React for the frontend. Node.js scores 66 out of 70, ahead of Python at 57 and Java at 50. React also scores 66, compared with 58 for Vue.js and 57 for Angular. These results apply to the proposed dashboard context and the experience assumptions stated above.

The two main criteria behind this choice are existing experience and suitability for regular data refresh. Both have a weight of three. Assuming greater familiarity with JavaScript and React, this combination should make implementation and debugging easier. Using JavaScript across the backend and frontend also reduces language switching. For data refresh, Node.js supports asynchronous network requests, while React updates the interface when its state changes. These features suit a dashboard that regularly retrieves external data.

The main trade-off is JavaScript’s lack of static type checking by default. Invalid request data can cause errors that only appear during execution. To reduce this risk, the backend validates incoming fields and returns clear HTTP errors. Checks cover successful requests, missing resources, and invalid authentication. This approach keeps the bootstrap small while addressing the main risks of its routes.

Independent team scores and a discussion record were not provided, so no actual disagreement or resolution is claimed. One useful comparison topic is Python versus Node.js: Python may be preferable for data analysis, while Node.js supports a shared language across the application. The proposed resolution method is to compare independent scores against the same fixed criteria and discuss differences greater than two points. The recommendation therefore represents a proposed technical choice, not a documented team consensus.
