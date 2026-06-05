import { InventoryGrid } from '@/ui/components';
import { useLocale } from '@/ui/context';
import { DialogBase } from './dialog-base';

export function InventoryDialog() {
  const { locale } = useLocale();
  return (
    <DialogBase
      id='inventory'
      title={locale.inventory.title}
      size='md'
      avoidBottom
    >
      <InventoryGrid />
    </DialogBase>
  );
}
