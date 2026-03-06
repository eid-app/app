import * as parent from 'parent';

export function parent() {
    const parent = parent.parent();

    return { name: parent?.name, path: parent?.path };
}
