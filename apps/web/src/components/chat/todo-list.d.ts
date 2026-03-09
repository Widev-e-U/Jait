export interface TodoItem {
    id: number;
    title: string;
    status: 'not-started' | 'in-progress' | 'completed';
}
interface TodoListProps {
    items: TodoItem[];
    className?: string;
}
export declare function TodoList({ items, className }: TodoListProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=todo-list.d.ts.map