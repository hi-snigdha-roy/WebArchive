import { CollectionScreen } from '@/components/collection-screen';

export default async function CollectionPage(props: PageProps<'/collection/[id]'>) {
  const { id } = await props.params;
  return <CollectionScreen collectionId={id} />;
}
