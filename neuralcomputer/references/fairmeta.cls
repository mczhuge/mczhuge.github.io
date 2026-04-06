% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% A new style for FAIR pre-prints
% Author: dlp@meta.com
% Version: 1.1
% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Class declarations %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{fairmeta}
\LoadClassWithOptions{article}

% Layout %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[top=2.25cm, bottom=2.5cm, left=2.5cm, right=2.5cm, columnsep=0.65cm]{geometry}
\RequirePackage{microtype}
\RequirePackage{placeins}
\RequirePackage{hyphenat}
\RequirePackage{setspace}
\RequirePackage{parskip}
\RequirePackage{amsmath}
\RequirePackage[latin, english]{babel}
\RequirePackage{lipsum}
\RequirePackage{etoolbox}
\RequirePackage{array}
\RequirePackage{siunitx}
\sisetup{detect-weight=true,detect-family=true,group-minimum-digits=4}
\RequirePackage{iftex}

\DisableLigatures[f]{family=sf*} 

% Graphics %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{graphicx}
\RequirePackage{subcaption}

% Tables %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{booktabs}
\RequirePackage{array}
\RequirePackage{tabularx}
\RequirePackage{nicematrix}
\RequirePackage{multirow}
\RequirePackage{bm}
% Column helpers: ragged-right/center/right with fixed widths.
% Use m-columns so multi-line entries are vertically centered within rows.
\newcolumntype{L}[1]{>{\raggedright\arraybackslash}m{#1}}
\newcolumntype{C}[1]{>{\centering\arraybackslash}m{#1}}
\newcolumntype{R}[1]{>{\raggedleft\arraybackslash}m{#1}}
\newcommand{\nm}[1]{#1}
% Flexible ragged-right column for tabularx
\newcolumntype{Y}{>{\raggedright\arraybackslash}X}

% Colorful stuff %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[most]{tcolorbox}
\RequirePackage{xcolor}
% Keep Meta/arXiv theme consistent with the ICML submission (warm terracotta).
\definecolor{metablue}{HTML}{C25A2C}
\definecolor{metafg}{HTML}{1C2B33}
\definecolor{metabg}{HTML}{F1F4F7}

% References %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{hyperref}
\RequirePackage[noabbrev,nameinlink]{cleveref}
\hypersetup{
  colorlinks,
  linkcolor=metablue,
  citecolor=metablue,
  urlcolor=metablue
}

% Math and references polishing %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\RequirePackage{amsmath,amssymb,mathtools}
% Section-based equation numbering for clearer context
\numberwithin{equation}{section}

% Consistent, concise names for cleveref
\crefname{figure}{Fig.}{Figs.}
\Crefname{figure}{Figure}{Figures}
\crefname{table}{Table}{Tables}
\Crefname{table}{Table}{Tables}
\crefname{section}{Sec.}{Secs.}
\Crefname{section}{Section}{Sections}
\crefname{equation}{Eq.}{Eqs.}
\Crefname{equation}{Equation}{Equations}

% Lightweight reference helpers (authors can keep using \cref/\Cref)
\newcommand{\Secref}[1]{\Cref{#1}}% Section
\newcommand{\secref}[1]{\cref{#1}}% Sec.
\newcommand{\Figref}[1]{\Cref{#1}}% Figure
\newcommand{\figref}[1]{\cref{#1}}% Fig.
\newcommand{\Tabref}[1]{\Cref{#1}}% Table
\newcommand{\tabref}[1]{\cref{#1}}% Table (lower)
\newcommand{\Eqref}[1]{\cref{#1}}% Eq.

% (Table column types and small helpers are defined in assets/paperstyle.)
% Consistent cref names
\crefname{section}{Section}{Sections}
\Crefname{section}{Section}{Sections}
\crefname{figure}{Figure}{Figures}
\Crefname{figure}{Figure}{Figures}
\crefname{table}{Table}{Tables}
\Crefname{table}{Table}{Tables}
\crefname{equation}{Eq.}{Eqs.}
\Crefname{equation}{Eq.}{Eqs.}

% Consistent short labels for cross-references
% Use \cref{...} / \Cref{...}: Eq. (1), Fig. 2, Tab. 3, Sec. 4
\crefformat{equation}{Eq.~(#2#1#3)}
\Crefformat{equation}{Equation~(#2#1#3)}
\crefname{figure}{Fig.}{Figs.}
\Crefname{figure}{Figure}{Figures}
\crefname{table}{Tab.}{Tabs.}
\Crefname{table}{Table}{Tables}
\crefname{section}{Sec.}{Secs.}
\Crefname{section}{Section}{Sections}
\crefname{appendix}{App.}{Apps.}
\Crefname{appendix}{Appendix}{Appendices}

\RequirePackage[round,authoryear]{natbib}
\def\bibfont{\small}

% Section and caption format %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{titlesec}
\titleformat*{\paragraph}{\itshape}
\titleformat*{\section}{\Large\sffamily\bfseries}
\titleformat*{\subsection}{\large\sffamily\bfseries}
\titleformat*{\subsubsection}{\normalsize\sffamily\bfseries}
\DeclareTextFontCommand{\textbf}{\bfseries\sffamily}

\RequirePackage{caption}
\DeclareCaptionLabelSeparator{custom}{}
\DeclareCaptionFormat{custom}{{\sffamily\textbf{#1 #2}} #3}
\captionsetup{singlelinecheck=false,format=custom,labelsep=custom,font=small,skip=6pt}
\captionsetup[sub]{singlelinecheck=true,format=custom,labelsep=custom,font=small,skip=4pt}

% Math quality improvements
\RequirePackage{mathtools} % loads amsmath
% Common paired delimiters (use with \DeclarePairedDelimiter)
\DeclarePairedDelimiter{\abs}{\lvert}{\rvert}
\DeclarePairedDelimiter{\norm}{\lVert}{\rVert}
\DeclarePairedDelimiter{\paren}{\lparen}{\rparen}
\DeclarePairedDelimiter{\bracket}{\lbrack}{\rbrack}
\DeclarePairedDelimiter{\bracep}{\lbrace}{\rbrace}

% Tight, clean table environment
\newenvironment{tighttable}{\begingroup\small\setlength{\tabcolsep}{6pt}\renewcommand{\arraystretch}{1.15}\centering}{\par\endgroup}
% Compact, consistent wrapper for small scheme-like tables
% Usage: \begin{smallschemetable}{Caption}{tab:label} ... \end{smallschemetable}
\newenvironment{smallschemetable}[2]{%
  \begin{table}[htbp]
  \centering
  \small
  \caption{#1}
  \label{#2}
}{\end{table}}

% Meta custom fonts and engine-specific handling %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% http://c.caignaert.free.fr/Install-ttf-Font.pdf

\renewcommand*\ttdefault{cmvtt}

% Engine-specific configuration:
% - PDFTeX: keep original T1 setup; add UTF-8 + CJK so Chinese compiles.
% - XeTeX/LuaTeX: use fontspec (+ xeCJK for Chinese) and load Optimistic.tff directly.
\ifPDFTeX
  \RequirePackage[T1]{fontenc}
  \RequirePackage[utf8]{inputenc}
  % Enable CJK under pdfLaTeX without changing document sources.
  \RequirePackage{CJKutf8}
  % Wrap the whole document in a CJK environment so UTF-8 CJK characters work anywhere.
  \AtBeginDocument{\begin{CJK*}{UTF8}{gbsn}}
  \AtEndDocument{\end{CJK*}}

  % Keep the original Optimistic mapping for sans-serif text.
  % \pdfmapline{+optimistic < assets/Optimistic.ttf <T1-WGL4.enc}
  % \renewcommand{\sfdefault}{optimistic}
  \DeclareFontFamily{T1}{optimistic}{}
  \DeclareFontShape{T1}{optimistic}{m}{n}{<-> s * [0.88] assets/optimistic}{}
  \DeclareFontShape{T1}{optimistic}{b}{n}{<-> s * [0.88] assets/optimistic}{}
  \pdfmapline{+optimistic < assets/Optimistic.ttf <T1-WGL4.enc}
  \renewcommand{\sfdefault}{optimistic}
\else
  % XeTeX / LuaTeX path: use system/font files directly and xeCJK for Chinese
  \RequirePackage{fontspec}
  \defaultfontfeatures{Ligatures=TeX}
  % Use the Optimistic font file shipped in assets for sans-serif family.
  \setsansfont[Path=assets/,Extension=.ttf]{Optimistic}
  % Enable CJK support; rely on default CJK fonts available in TeX Live.
  \IfFileExists{xeCJK.sty}{%
    \RequirePackage{xeCJK}
    % Defaults (e.g., Fandol) are fine across platforms; users can override if needed.
  }{}
\fi

% Authors, affiliations, infos %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\renewcommand\addtolist[5][]{
  \begingroup
    \if\relax#3\relax\def\sep{}\else\def\sep{#5}\fi
    \let\protect\@unexpandable@protect 
    \xdef#3{\expandafter{#3}\sep #4[#1]{#2}}%
  \endgroup
}

\newcommand\authorlist{}
\newcommand\authorformat[2][]{{\sffamily \bfseries #2$^{#1}$}}
\renewcommand\author[2][]{\addtolist[#1]{#2}{\authorlist}{\authorformat}{, }}

\makeatletter
\newcommand{\authorbreak}{\g@addto@macro\authorlist{\unskip\par\vspace{0.3cm}}}
\makeatother

\newcommand\affiliationlist{}
\newcommand\affiliationformat[2][]{{\normalsize $^{#1}$#2}}
\newcommand\affiliation[2][]{\addtolist[#1]{#2}{\affiliationlist}{\affiliationformat}{, }}

\newcommand\contributionlist{}
\newcommand\contributionformat[2][]{{\small $^{#1}$#2}}
\newcommand\contribution[2][]{\addtolist[#1]{#2}{\contributionlist}{\contributionformat}{, }}

\newcommand\metadatalist{}
\newcommand\metadataformat[2][]{{\small {\sffamily \bfseries #1:} #2}}
\newcommand\metadata[2][]{\addtolist[#1]{#2}{\metadatalist}{\metadataformat}{\par}}

\renewcommand{\abstract}[1]{\def\abstractlist{{\color{metafg} #1}}}
\newcommand{\email}[1]{\href{mailto:#1}{\texttt{#1}}}

\renewcommand\date[1]{\metadata[Date]{#1}}
\newcommand\correspondence[1]{\metadata[Correspond]{#1}}

\renewcommand{\title}[1]{\newcommand{\titlelist}{{\huge\sffamily\bfseries #1}}}

\newcommand{\beginappendix}{\appendix{\huge\sffamily Appendix\par}}

% Titlebox %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


% Titlebox spacing and logo size (customizable) %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\newlength{\TitleAuthorSpace}
\setlength{\TitleAuthorSpace}{0.4cm} % space between title and author names
\newlength{\MetaLogoWidth}
\setlength{\MetaLogoWidth}{2cm} % width of the Meta logo in title box
\newlength{\MetaLogoXShift}
\setlength{\MetaLogoXShift}{1.2cm} % how much to move logo left from right edge
\newlength{\MetaLogoYShift}
\setlength{\MetaLogoYShift}{0.8cm} % how much to move logo up from bottom edge

\newcommand{\mymaketitle}{%
  \tcbset{enhanced,frame hidden}
  \tcbset{left=0.5cm}
  \tcbset{right=0.5cm}
  \tcbset{top=0.5cm}
  \tcbset{bottom=0.5cm}
  \tcbset{arc=10pt}
  \tcbset{colback=metabg}
  \tcbset{before skip=0pt}
  \tcbset{grow to left by=1.5pt}
  \tcbset{grow to right by=1.5pt}
  \tcbset{overlay={\node[
    anchor=south east,
    at= (frame.south east),
    xshift=-\MetaLogoXShift,
    yshift=\MetaLogoYShift] {\includegraphics[width=\MetaLogoWidth]{assets/logometa.pdf}};}}
  % 
  \begin{tcolorbox}
    \setlength{\parindent}{0cm}
    \setlength{\parskip}{0.5cm}
    {
      \setlength{\parskip}{0cm}
      \raggedright
      \nohyphens
      %
      { 
        \setstretch{1.618}
        \titlelist\par
      }
      \vskip \TitleAuthorSpace
      %
      \authorlist\par
      \vskip 0.2cm
      %
      \affiliationlist\par
      %
      \contributionlist\par
    }
    %
    \abstractlist\par
    %
    \vskip 0.5cm
    %
    {
      \setlength{\parskip}{0cm}
      \ifdefempty{\metadatalist}{\vspace*{0.65cm}}{\metadatalist\par}
    }
  \end{tcolorbox}
  \tcbset{reset}
  \FloatBarrier
}

\if@twocolumn%
\renewcommand{\maketitle}{
\twocolumn[%
  \mymaketitle
  \vskip 0.38cm
]
}%
\else%
\renewcommand{\maketitle}{
  \mymaketitle
}%
\fi
