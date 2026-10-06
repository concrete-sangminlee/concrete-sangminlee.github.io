# Research Statement

Sang Min Lee · Ph.D. Candidate in Artificial Intelligence, Seoul National University

Buildings and infrastructure are inspected, monitored, and designed under constraints that most machine learning research does not face. Data on damaged structures are scarce, because most structures are healthy most of the time. Sensors are expensive to install, so measurements are sparse. Inspection happens on site, far from a GPU. And the documents that govern design, building codes, are safety-critical: a model that confuses one clause with a nearly identical one gives the wrong answer with confidence. My research develops machine learning methods that work within these constraints, so that inspection and design decisions become more reliable rather than merely more automated.

I work across four connected problems: automated non-destructive testing, structural health monitoring, data-driven wind engineering, and language models for building codes. The common thread is learning from what practice can actually provide: little failure data, few sensors, limited on-site compute, and text in which small differences matter.

## Automated non-destructive testing

Impact-echo testing can locate delamination and voids inside concrete, but interpreting the signals still requires an experienced inspector, and results vary with operator and equipment. In work published in the *Journal of Nondestructive Evaluation* (2025), I built a classifier for impact-echo results from time-series features such as instantaneous frequency and spectral entropy, and compared it against conventional peak-frequency analysis and a deep learning model. To make the classifier hold up across conditions, I trained it on open data collected by two organizations with different operators and equipment. The model identified both the presence and the type of defects, and was most accurate for shallow delamination.

I am now taking this from the laboratory to the field. I am developing an edge-AI impact-echo system that runs the classifier on site, and, with colleagues, applying impact-echo testing to concrete behind the steel liner plates of nuclear containment buildings, where the liner complicates the response and defects cannot be seen from the surface. This line of work also produced a registered Korean patent on AI-based detection of internal defects in concrete members.

## Structural health monitoring

Monitoring systems rarely see the failures they are meant to detect. In a paper in the *Journal of Structural Engineering* (2025), we addressed this with a multiclass deep support vector data description (SVDD) model, trained only on data from the structure in its normal condition, and combined it with kernel density estimation. On public data from a three-story shake-table experiment, it reached an average accuracy of 88.11%, against a maximum of 58.68% for conventional machine learning methods. Extensions of this idea to system identification with multi-sphere deep SVDD were presented at ACEM24.

The same concern for deployability shaped my work on crack images. Deep networks classify cracks accurately but are too large for portable inspection devices. In the *ACI Structural Journal* (2025), I showed that a random forest on histogram-of-oriented-gradients and local-binary-pattern features gives up only a little accuracy relative to a convolutional network while being far smaller and faster, which makes on-device diagnosis practical.

## Data-driven wind engineering

Wind loads on tall buildings are measured with many pressure taps in wind-tunnel tests, and each tap adds cost. My work asks how much of that information can be recovered from fewer measurements. I have predicted façade wind pressure coefficients from a reduced set of taps with recurrent networks (ASEM21 and Korea Concrete Institute conferences), grouped taps by the similarity of their time histories with dynamic time warping (EACWE 2022) and with deep learning, and most recently reconstructed full wind-load time histories from reduced tap measurements (Wind Engineering Institute of Korea, 2026). With colleagues, I have also estimated design wind speed from satellite imagery (*Journal of the Wind Engineering Institute of Korea*, 2023). A registered patent covers AI-based wind load estimation. As a visiting researcher at the National Weather Center, University of Oklahoma (2025), I worked with the Hydrometeorology and Remote Sensing Lab on machine learning for remote sensing and wind engineering, which broadened this work from the building to the environment around it.

## Language models for building codes

Engineers spend significant time locating and interpreting provisions in structural and wind design codes. Language models can help, but only if they retrieve the right clause. I built retrieval-augmented generation over wind load design codes (APCWE10, 2025) and a code-specialized language model framework with a mixture-of-experts architecture (2024). The central difficulty is that code clauses often differ by a single condition, such as a height limit, an exposure category, or a load combination, and a retriever that treats them as interchangeable produces answers that look correct and are unsafe. In CoMuRAG (JCDL 2026), I train retrievers with condition-mutated hard negatives: clauses deliberately altered in exactly those conditions, so the model learns to tell them apart in safety-sensitive Korean building-code retrieval. My industry work building an LLM-as-a-judge system, including aligning the evaluator with human judgments, informs how I evaluate these systems.

## Future directions

Over the next several years I plan to pursue three directions that build on this foundation.

**Transferable models for inspection signals.** Impact-echo, ultrasonic, and vibration data share structure but are modeled separately, device by device. I aim to learn representations that transfer across equipment, operators, and structure types, so that a new inspection setting needs little labeled data, and to pair them with uncertainty estimates an inspector can act on.

**Sparse sensing with physical consistency.** For wind and structural response, I want to combine learned reconstruction with physical constraints, so that predictions from few sensors respect known behavior and report when they are extrapolating. This connects directly to sensor placement: deciding where to measure, not only how to interpolate.

**Verifiable code assistants.** Retrieval is the first step; the goal is assistants that check a design against code requirements and show which clause, under which condition, supports each conclusion. I plan to develop benchmarks and training methods for condition-sensitive reasoning over codes, in Korean and English, with the evaluation rigor that safety-critical use requires.

These directions lend themselves to collaboration with structural engineers, inspection practitioners, and code committees, and to funding through national research programs such as the Hyper-converged Forensic Research Center for Infrastructure, where I currently work. My aim is a research program in which machine learning earns trust in infrastructure practice by being designed around its constraints from the start.
