from __future__ import annotations

import os
from pathlib import Path

import nbformat as nbf
from nbclient import NotebookClient


def build_notebook(output_path: Path) -> None:
    notebook = nbf.v4.new_notebook()
    notebook.metadata.kernelspec = {
        "display_name": "Python 3",
        "language": "python",
        "name": "python3",
    }
    notebook.metadata.language_info = {"name": "python", "version": "3.12"}
    notebook.cells = [
        nbf.v4.new_markdown_cell(
            "# Analyse Google Health de Soma\n"
            "Audit de qualité, couverture des séries et relations personnelles calculées à partir de l’export Takeout."
        ),
        nbf.v4.new_markdown_cell(
            "## Chargement et préparation\n"
            "Les sources dupliquées sont résolues avant l’analyse. Les données absentes restent absentes."
        ),
        nbf.v4.new_code_cell(
            "import json\n"
            "import os\n"
            "from pathlib import Path\n"
            "import pandas as pd\n"
            "from IPython.display import Image, display\n"
            "from analysis.google_health_takeout import run_analysis\n\n"
            "root = Path(os.environ.get('GOOGLE_HEALTH_TAKEOUT', Path.home() / 'Downloads' / 'Takeout' / 'Google Health'))\n"
            "output = Path('analysis/private/google-health')\n"
            "summary = run_analysis(root, output)\n"
            "{key: summary[key] for key in ['daily_start', 'daily_end', 'fitbit_days', 'sleep_days', 'hrv_days', 'complete_weeks', 'tests_calculated']}"
        ),
        nbf.v4.new_markdown_cell(
            "## Qualité de l’export\n"
            "Les anomalies ci-dessous déterminent les fichiers conservés ou exclus."
        ),
        nbf.v4.new_code_cell(
            "pd.DataFrame(summary['quality_findings'])[['severity', 'finding', 'detail']]"
        ),
        nbf.v4.new_markdown_cell(
            "## Couverture disponible\n"
            "La couverture est calculée entre la première et la dernière valeur de chaque série."
        ),
        nbf.v4.new_code_cell(
            "coverage = pd.read_csv(output / 'coverage.csv')\n"
            "coverage.assign(coverage_pct=(coverage['coverage'] * 100).round(1))[['label', 'days', 'coverage_pct', 'start', 'end']]"
        ),
        nbf.v4.new_code_cell("display(Image(filename=output / 'coverage.png'))"),
        nbf.v4.new_markdown_cell(
            "## Relations prioritaires\n"
            "Le classement combine amplitude, précision de l’intervalle, taille effective et correction des comparaisons multiples."
        ),
        nbf.v4.new_code_cell(
            "relations = pd.read_csv(output / 'relations.csv')\n"
            "top = relations.loc[relations['rho'].notna()].head(15).copy()\n"
            "for column in ['rho', 'effect', 'effective_n', 'p_value', 'q_value', 'ci_low', 'ci_high', 'relevance']:\n"
            "    top[column] = top[column].round(3)\n"
            "top[['label', 'grain', 'rho', 'effect', 'outcome_unit', 'n', 'effective_n', 'ci_low', 'ci_high', 'q_value', 'relevance']]"
        ),
        nbf.v4.new_code_cell("display(Image(filename=output / 'top-relations.png'))"),
        nbf.v4.new_markdown_cell(
            "## Vérification du principal résultat\n"
            "Le résultat sur le coucher est recalculé sur les deux moitiés de l’historique et séparément entre jours de semaine et week-end."
        ),
        nbf.v4.new_code_cell(
            "sensitivity = pd.DataFrame(summary['bedtime_sensitivity'])\n"
            "sensitivity.assign(rho=sensitivity['rho'].round(3), effect_minutes=sensitivity['effect_minutes'].round(1))"
        ),
        nbf.v4.new_markdown_cell(
            "## Méthode\n"
            "- Spearman compare l’ordre des valeurs et détecte les tendances monotones.\n"
            "- Le nombre de jours n’est pas converti en règle arbitraire : il élargit ou resserre directement l’intervalle d’incertitude.\n"
            "- La taille effective diminue lorsque deux séries se répètent fortement d’un jour au suivant.\n"
            "- Benjamini–Hochberg ajuste les résultats quand plusieurs relations sont testées.\n"
            "- Le plancher de six paires est uniquement nécessaire pour produire un calcul exploitable."
        ),
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    client = NotebookClient(notebook, timeout=300, kernel_name="python3", resources={"metadata": {"path": str(Path.cwd())}})
    executed = client.execute()
    nbf.write(executed, output_path)


if __name__ == "__main__":
    destination = Path(os.environ.get("SOMA_HEALTH_NOTEBOOK", "analysis/private/google-health/google_health_takeout_analysis.ipynb"))
    build_notebook(destination)
    print(destination)
