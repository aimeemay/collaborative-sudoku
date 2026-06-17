export type SudokuDifficulty = "easy" | "medium" | "hard";

export type GeneratedSudoku = {
	puzzle: string;
	solution: string;
	difficulty: SudokuDifficulty;
};

type DifficultyProfile = {
	targetClues: number;
	minRowClues: number;
	minColumnClues: number;
};

const difficultyProfiles: Record<SudokuDifficulty, DifficultyProfile> = {
	easy: {
		targetClues: 41,
		minRowClues: 3,
		minColumnClues: 3,
	},
	medium: {
		targetClues: 33,
		minRowClues: 2,
		minColumnClues: 2,
	},
	hard: {
		targetClues: 27,
		minRowClues: 1,
		minColumnClues: 1,
	},
};

export function generateSudoku(difficulty: SudokuDifficulty): GeneratedSudoku {
	const profile = difficultyProfiles[difficulty];
	const solutionBoard = generateSolutionBoard();
	const puzzleBoard = buildPuzzleFromSolution(solutionBoard, profile);

	return {
		difficulty,
		solution: solutionBoard.join(""),
		puzzle: puzzleBoard.join(""),
	};
}

function generateSolutionBoard(): number[] {
	const board = new Array<number>(81).fill(0);
	fillBoard(board);
	return board;
}

function buildPuzzleFromSolution(solution: number[], profile: DifficultyProfile): number[] {
	const puzzle = [...solution];
	const halfIndexes = Array.from({ length: 41 }, (_, index) => index);
	shuffle(halfIndexes);

	for (const index of halfIndexes) {
		const mirror = 80 - index;
		if (puzzle[index] === 0) {
			continue;
		}

		const removedCount = index === mirror ? 1 : 2;
		if (countClues(puzzle) - removedCount < profile.targetClues) {
			continue;
		}

		const leftBackup = puzzle[index];
		const rightBackup = puzzle[mirror];
		puzzle[index] = 0;
		puzzle[mirror] = 0;

		if (!meetsDistributionProfile(puzzle, profile) || countSolutions(puzzle, 2) !== 1) {
			puzzle[index] = leftBackup;
			puzzle[mirror] = rightBackup;
		}
	}

	const remaining = shuffle(
		Array.from({ length: 81 }, (_, index) => index).filter((index) => puzzle[index] !== 0)
	);
	for (const index of remaining) {
		if (countClues(puzzle) <= profile.targetClues) {
			break;
		}

		const backup = puzzle[index];
		puzzle[index] = 0;
		if (!meetsDistributionProfile(puzzle, profile) || countSolutions(puzzle, 2) !== 1) {
			puzzle[index] = backup;
		}
	}

	return puzzle;
}

function fillBoard(board: number[]): boolean {
	const emptyIndex = selectNextEmpty(board);
	if (emptyIndex === -1) {
		return true;
	}

	const candidates = shuffle(getCandidates(board, emptyIndex));
	for (const candidate of candidates) {
		board[emptyIndex] = candidate;
		if (fillBoard(board)) {
			return true;
		}
		board[emptyIndex] = 0;
	}

	return false;
}

function countSolutions(board: number[], limit: number): number {
	const working = [...board];
	let count = 0;

	const solve = (): void => {
		if (count >= limit) {
			return;
		}

		const emptyIndex = selectNextEmpty(working);
		if (emptyIndex === -1) {
			count += 1;
			return;
		}

		for (const candidate of getCandidates(working, emptyIndex)) {
			working[emptyIndex] = candidate;
			solve();
			working[emptyIndex] = 0;
			if (count >= limit) {
				return;
			}
		}
	};

	solve();
	return count;
}

function selectNextEmpty(board: number[]): number {
	let bestIndex = -1;
	let smallestCandidateCount = 10;

	for (let index = 0; index < 81; index += 1) {
		if (board[index] !== 0) {
			continue;
		}
		const candidateCount = getCandidates(board, index).length;
		if (candidateCount < smallestCandidateCount) {
			smallestCandidateCount = candidateCount;
			bestIndex = index;
		}
		if (candidateCount === 1) {
			break;
		}
	}

	return bestIndex;
}

function getCandidates(board: number[], index: number): number[] {
	const row = Math.floor(index / 9);
	const column = index % 9;
	const used = new Set<number>();

	for (let col = 0; col < 9; col += 1) {
		const value = board[row * 9 + col];
		if (value !== 0) {
			used.add(value);
		}
	}

	for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
		const value = board[rowIndex * 9 + column];
		if (value !== 0) {
			used.add(value);
		}
	}

	const boxStartRow = Math.floor(row / 3) * 3;
	const boxStartCol = Math.floor(column / 3) * 3;
	for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
		for (let colOffset = 0; colOffset < 3; colOffset += 1) {
			const boxIndex = (boxStartRow + rowOffset) * 9 + (boxStartCol + colOffset);
			const value = board[boxIndex];
			if (value !== 0) {
				used.add(value);
			}
		}
	}

	const candidates: number[] = [];
	for (let value = 1; value <= 9; value += 1) {
		if (!used.has(value)) {
			candidates.push(value);
		}
	}
	return candidates;
}

function countClues(board: number[]): number {
	return board.reduce((total, value) => (value === 0 ? total : total + 1), 0);
}

function meetsDistributionProfile(board: number[], profile: DifficultyProfile): boolean {
	for (let row = 0; row < 9; row += 1) {
		let rowClues = 0;
		for (let col = 0; col < 9; col += 1) {
			if (board[row * 9 + col] !== 0) {
				rowClues += 1;
			}
		}
		if (rowClues < profile.minRowClues) {
			return false;
		}
	}

	for (let col = 0; col < 9; col += 1) {
		let columnClues = 0;
		for (let row = 0; row < 9; row += 1) {
			if (board[row * 9 + col] !== 0) {
				columnClues += 1;
			}
		}
		if (columnClues < profile.minColumnClues) {
			return false;
		}
	}

	return true;
}

function shuffle<T>(items: T[]): T[] {
	for (let index = items.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		const temp = items[index];
		items[index] = items[swapIndex];
		items[swapIndex] = temp;
	}
	return items;
}
