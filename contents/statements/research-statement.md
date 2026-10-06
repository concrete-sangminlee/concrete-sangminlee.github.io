# Research Statement

Sang Min Lee · Ph.D. Candidate in Artificial Intelligence, Seoul National University

Machine learning is entering the inspection, monitoring, and design of buildings and infrastructure, but the conditions it meets there are the opposite of those it was developed for. Failure data are scarce, because most structures are healthy most of the time. Sensors are scarce, because each one costs money to install and maintain. Compute is scarce on site, far from a GPU. Expert attention is scarce, and so is tolerance for error: a design code assistant that confuses two nearly identical clauses gives a wrong answer with confidence. **My research develops machine learning that is dependable under these scarcities, so that engineering decisions become more reliable rather than merely more automated.**

I come to this problem from both sides. I was trained in structural engineering (B.S. and M.S., Seoul National University, with a double major in electrical and computer engineering) and am completing a Ph.D. in artificial intelligence, advised by Prof. Thomas H.-K. Kang. My work spans four application areas, connected by one methodological question: *what must a model learn, and from how little, to be trusted in engineering practice?*

| Scarcity | My approach | Representative work |
|---|---|---|
| Failure data | learn normal behavior; detect departures | Multiclass deep SVDD, *J. Struct. Eng.* 2025 |
| Expert interpretation | automate signal reading that holds across operators and equipment | Impact-echo classification, *J. Nondestruct. Eval.* 2025 |
| On-site compute | small models and edge systems | Lightweight crack classifiers, *ACI Struct. J.* 2025; edge-AI impact-echo |
| Sensors | reconstruct what was not measured | Wind loads from reduced pressure taps, 2021–2026 |
| Tolerance for error | train on the distinctions that matter | CoMuRAG, condition-mutated hard negatives, JCDL 2026 |

## Learning from healthy structures

Monitoring systems rarely see the failures they are meant to catch, so supervised damage classifiers are trained on data that practice cannot supply. In the *Journal of Structural Engineering* (2025), we instead trained a multiclass deep support vector data description (SVDD) model only on data from the structure in its normal condition, and combined it with kernel density estimation to improve accuracy. On public data from a three-story shake-table experiment, the model reached an average accuracy of 88.11%, where conventional machine learning methods reach at most 58.68%. I extended the idea to system identification with multi-sphere deep SVDD (ACEM24). The lesson carries beyond this dataset: in structural monitoring, modeling normal behavior well is more achievable, and more useful, than modeling every way a structure can fail.

## Automating expert interpretation, then taking it to the field

Impact-echo testing can locate delamination and voids inside concrete, but its signals still require an experienced inspector, and results vary with operator and equipment. In the *Journal of Nondestructive Evaluation* (2025), I developed a classifier on time-series features such as instantaneous frequency and spectral entropy, compared it with conventional peak-frequency analysis and a deep learning model, and trained it on open data collected by two organizations with different operators and equipment, so that it would not depend on any one setup. It identified both the presence and the type of defects, and was most accurate for shallow delamination.

Deployment shaped the next steps. Deep crack-image classifiers are accurate but too large for portable devices; in the *ACI Structural Journal* (2025), I showed that a random forest on local-binary-pattern and gradient features gives up only a little accuracy while being far smaller and faster, which makes on-device diagnosis practical. I am now building an edge-AI impact-echo system that runs on site, and, with colleagues, applying impact-echo testing to concrete behind the steel liner plates of nuclear containment buildings, where defects cannot be reached from the surface. Two registered Korean patents, on AI-based detection of internal defects in concrete and on AI-based wind load estimation, came from this work.

## Recovering what was not measured

Wind loads on tall buildings are measured with many pressure taps in wind-tunnel tests, and each tap adds cost. Over a sequence of studies I have asked how much of that information can be recovered from fewer measurements: predicting façade pressure coefficients from a reduced set of taps with recurrent networks (ASEM21), grouping taps whose time histories behave alike with dynamic time warping (EACWE 2022) and deep learning (2025), and reconstructing full wind-load time histories from reduced measurements (Wind Engineering Institute of Korea, 2026). With colleagues, I have also estimated design wind speed from satellite imagery (2023). As a visiting researcher at the National Weather Center, University of Oklahoma (2025), I worked with the Hydrometeorology and Remote Sensing Lab, which extended this line from the building to the environment around it.

## Language models that respect the conditions in a code

Building codes are where engineering knowledge is most explicit and errors are least acceptable. I built retrieval-augmented generation over wind load design codes (APCWE10, 2025) and a code-specialized language model framework with a mixture-of-experts architecture (2024). The central difficulty is that clauses often differ by a single condition, such as a height limit, an exposure category, or a load combination; a retriever that treats them as interchangeable returns answers that look right and are unsafe. CoMuRAG (JCDL 2026) addresses this directly: it trains retrievers on condition-mutated hard negatives, clauses altered in exactly those conditions, so the model learns the distinctions an engineer would check in safety-sensitive Korean building-code retrieval. My industry work building an LLM-as-a-judge system, including aligning the evaluator with human judgments, informs how I evaluate such systems: against what an expert would accept, not only against a benchmark score.

## Research agenda

I will build a group around three thrusts, each grounded in data and partnerships I already work with.

**1. Inspection models that transfer.** Impact-echo, ultrasonic, and vibration measurements share physics but are modeled separately, device by device. *First project:* a shared representation for impact-echo signals across equipment and structure types, using the multi-organization data from my *JNDE* work and the liner-plate experiments, with calibrated uncertainty an inspector can act on. *Longer term:* inspection models that adapt to a new structure from a handful of labeled tests.

**2. Sparse sensing with physical consistency.** Reconstruction from few sensors should respect known behavior and report when it is extrapolating. *First project:* wind-load reconstruction that couples learned models with aerodynamic constraints, and uses the same model to choose where taps or sensors should go. *Longer term:* monitoring designs in which sensor placement, reconstruction, and anomaly detection are optimized together.

**3. Verifiable code assistants.** Retrieval is the first step; the goal is an assistant that checks a design against code requirements and cites the clause, and the condition, behind each conclusion. *First project:* a benchmark of condition-sensitive questions over Korean and international structural and wind codes, extending CoMuRAG from retrieval to reasoning. *Longer term:* assistants that code committees and practitioners can audit.

This agenda fits national research programs such as those I contribute to now, including the Hyper-converged Forensic Research Center for Infrastructure (NRF) and the Smart City Innovative Technology Demonstration Project (KAIA), as well as industry partnerships of the kind I have worked in with construction and AI companies. It also suits students from both civil engineering and computer science, which is the kind of group I want to lead: one in which machine learning earns trust in infrastructure practice because it is designed around that practice from the start.
