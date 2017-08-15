<p align="center">
  <img width="128" src="https://image.ibb.co/gmVHga/logo.png" />
</p>

<h1 align="center">TeXify</h1>

TeXify is a [GitHub App](https://developer.github.com/apps/) built on top of [`readme2tex`](https://github.com/leegao/readme2tex) that takes your *.tex.md files and replaces anything enclosed between dollar signs with rendered TeX every time push.

## How it works?

Whenever you push TeXify will run and seach for *.tex.md files in your last commit. For each one of those it'll run `readme2tex` which will take LaTeX expressions enclosed between dollar signs, convert it to plain SVG images, and then save the output into a .md extension file (That means that a file named README.tex.md will be processed and the output will be saved as README.md). After that, the output file and the new SVG images are then commited and pushed back to your repo.

